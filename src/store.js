// Guardado de mapas, carpetas y vídeos. Siempre en IndexedDB (la app funciona aunque el servidor esté apagado) y,
// si la app la sirve el servidor de Mapache, sincronizado con los archivos de tu ordenador (~/.mapache): así tu agente
// de IA puede leer y cambiar los mismos tableros y tú ves sus cambios al momento.
// Sin servidor de Mapache (por ejemplo, la app alojada como web estática) se queda solo en este navegador.
(function (root) {
  'use strict';
  const Merge = root.MMMerge;
  // Nombre de la base de datos y prefijo 'mindmap:' de las preferencias: se mantienen para no perder los datos ya guardados.
  const DB = 'mindmap';
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 4);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('maps')) db.createObjectStore('maps', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' });
        // Vídeos subidos: { id, blob, type, name }. Van aparte del mapa para no cargar el guardado ni el deshacer.
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
        // Estado de la sincronización con el servidor: 'b:<id>' { rev, base, dirty }, 'd:<id>' borrado pendiente,
        // 'fp:<id>' / 'fd:<id>' carpeta por subir / por borrar, 'folders' { ids }, 'm:<id>' vídeo ya subido.
        if (!db.objectStoreNames.contains('sync')) db.createObjectStore('sync', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error(root.MMI18n.t('Transacción cancelada')));
    });
  }

  const table = (name) => ({
    all: () => tx(name, 'readonly', (s) => s.getAll()),
    get: (id) => tx(name, 'readonly', (s) => s.get(id)),
    put: (v) => tx(name, 'readwrite', (s) => { s.put(v); }),
    remove: (id) => tx(name, 'readwrite', (s) => { s.delete(id); }),
  });
  const idb = { maps: table('maps'), folders: table('folders'), media: table('media'), sync: table('sync') };

  // ---------- Sincronización con el servidor ----------

  // 'local': sin servidor de Mapache (solo este navegador) · 'online': sincronizando · 'offline': el servidor no responde.
  let mode = 'local';
  let info = null;
  const listeners = new Set();
  const emit = (e) => { for (const fn of listeners) { try { fn(e); } catch (err) { console.error(err); } } };
  const setMode = (m) => { if (mode !== m) { mode = m; emit({ type: 'status', mode }); } };
  const seen = new Map(); // id -> versión del servidor que esta pestaña ya conoce
  const queues = new Map();
  // Todo lo de un mismo tablero va en fila (nunca dos cambios a la vez sobre el mismo).
  function serial(key, fn) {
    const p = (queues.get(key) || Promise.resolve()).then(fn, fn);
    queues.set(key, p.catch(() => {}));
    return p;
  }
  const strip = (b) => { if (!b) return b; const { rev, ...rest } = b; return rest; };

  async function call(method, url, body, headers = {}) {
    const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
    const opts = { method, cache: 'no-store', headers: { ...headers }, signal: AbortSignal.timeout(isBlob ? 600000 : 15000) };
    if (body !== undefined) {
      if (isBlob) opts.body = body;
      else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    }
    try { return await fetch(url, opts); } catch (err) { setMode('offline'); throw err; }
  }

  async function markDirty(id) {
    const s = (await idb.sync.get(`b:${id}`)) || { key: `b:${id}`, rev: null, base: null };
    s.dirty = true;
    await idb.sync.put(s);
  }

  async function pushBoard(id) {
    if (mode !== 'online') return;
    const key = `b:${id}`;
    const m = await idb.maps.get(id);
    const s = await idb.sync.get(key);
    if (!m || (s && !s.dirty)) return;
    const res = await call('PUT', `api/boards/${encodeURIComponent(id)}`, { board: m, baseRev: s && s.rev != null ? s.rev : null });
    if (res.ok) {
      const { rev } = await res.json();
      await idb.sync.put({ key, rev, base: m, dirty: false });
      seen.set(id, rev);
      return;
    }
    if (res.status === 409) {
      // Otro (tu agente, otra pestaña u otro navegador) lo cambió a la vez: se juntan los dos cambios y se vuelve a subir.
      const theirs = (await res.json()).board;
      const merged = Merge.mergeBoard(s && s.base, m, strip(theirs));
      await idb.maps.put(merged);
      await idb.sync.put({ key, rev: theirs.rev, base: strip(theirs), dirty: true });
      emit({ type: 'board', id });
      return pushBoard(id);
    }
    console.warn('Mapache: no se pudo guardar en el servidor', res.status);
  }

  // Trae del servidor la versión `rev` de un tablero (si no la tenemos ya).
  async function pullBoard(id, rev) {
    const key = `b:${id}`;
    const s = await idb.sync.get(key);
    if (s && s.dirty) return pushBoard(id); // hay cambios propios: al subirlos se fusionan
    if (!s || s.rev !== rev) {
      const res = await call('GET', `api/boards/${encodeURIComponent(id)}`);
      if (res.status === 404) return dropLocal(id);
      if (!res.ok) return;
      const b = await res.json();
      const clean = strip(b);
      await idb.maps.put(clean);
      await idb.sync.put({ key, rev: b.rev, base: clean, dirty: false });
      rev = b.rev;
    }
    if (seen.get(id) !== rev) { seen.set(id, rev); emit({ type: 'board', id }); }
  }

  // El tablero ya no está en el servidor (lo borró otro). Si aquí tiene cambios sin subir, se vuelve a subir.
  async function dropLocal(id) {
    const s = await idb.sync.get(`b:${id}`);
    if (s && s.dirty) return pushBoard(id);
    if (!(await idb.maps.get(id))) return;
    await idb.maps.remove(id);
    await idb.sync.remove(`b:${id}`);
    seen.delete(id);
    emit({ type: 'board', id, deleted: true });
  }

  async function pushDelete(id) {
    if (mode !== 'online') return;
    const res = await call('DELETE', `api/boards/${encodeURIComponent(id)}`);
    if (res.ok || res.status === 404) await idb.sync.remove(`d:${id}`);
  }

  async function syncFolders() {
    if (mode !== 'online') return;
    const all = await idb.sync.all();
    for (const r of all) {
      if (r.key.startsWith('fp:')) {
        const f = await idb.folders.get(r.key.slice(3));
        const res = f ? await call('PUT', `api/folders/${encodeURIComponent(f.id)}`, f) : { ok: true };
        if (res.ok) await idb.sync.remove(r.key);
      } else if (r.key.startsWith('fd:')) {
        const res = await call('DELETE', `api/folders/${encodeURIComponent(r.key.slice(3))}`);
        if (res.ok) await idb.sync.remove(r.key);
      }
    }
    const res = await call('GET', 'api/folders');
    if (!res.ok) return;
    const { folders } = await res.json();
    const meta = (await idb.sync.get('folders')) || { key: 'folders', ids: [] };
    const server = new Map(folders.map((f) => [f.id, f]));
    let changed = false;
    for (const f of await idb.folders.all()) {
      if (server.has(f.id)) continue;
      if (meta.ids.includes(f.id)) { await idb.folders.remove(f.id); changed = true; } // la borró otro
      else { const r = await call('PUT', `api/folders/${encodeURIComponent(f.id)}`, f); if (r.ok) server.set(f.id, f); } // nunca subida
    }
    for (const f of folders) {
      const cur = await idb.folders.get(f.id);
      if (!cur || !Merge.same(cur, f)) { await idb.folders.put(f); changed = true; }
    }
    await idb.sync.put({ key: 'folders', ids: [...server.keys()] });
    if (changed) emit({ type: 'folders' });
  }

  // Vídeos que solo están en este navegador: se suben una vez.
  async function syncMedia() {
    const done = new Set((await idb.sync.all()).filter((r) => r.key.startsWith('m:')).map((r) => r.key.slice(2)));
    for (const rec of await idb.media.all()) {
      if (done.has(rec.id) || mode !== 'online') continue;
      await serial(`m:${rec.id}`, () => uploadMedia(rec));
    }
  }
  async function uploadMedia(rec) {
    const head = await call('HEAD', `api/media/${encodeURIComponent(rec.id)}`);
    if (!head.ok) {
      const res = await call('PUT', `api/media/${encodeURIComponent(rec.id)}`, rec.blob, { 'Content-Type': rec.type || 'application/octet-stream', 'X-Media-Name': encodeURIComponent(rec.name || '') });
      if (!res.ok) return;
    }
    await idb.sync.put({ key: `m:${rec.id}` });
  }

  let syncing = null;
  function fullSync() {
    if (syncing) return syncing;
    syncing = (async () => {
      const res = await call('GET', 'api/boards');
      if (!res.ok) return;
      const list = await res.json();
      const server = new Map(list.map((b) => [b.id, b]));
      const marks = await idb.sync.all();
      for (const r of marks) if (r.key.startsWith('d:')) { server.delete(r.key.slice(2)); await serial(`b:${r.key.slice(2)}`, () => pushDelete(r.key.slice(2))); }
      await Promise.all([...server.values()].map((b) => serial(`b:${b.id}`, () => pullBoard(b.id, b.rev || 0))));
      const synced = new Map(marks.filter((r) => r.key.startsWith('b:')).map((r) => [r.key.slice(2), r]));
      for (const m of await idb.maps.all()) {
        if (server.has(m.id)) continue;
        const s = synced.get(m.id);
        // Nunca subido (tableros de antes de esta versión, o hechos sin servidor): se sube. Si ya se subió, lo borró otro.
        if (!s || s.dirty) await serial(`b:${m.id}`, async () => { await markDirty(m.id); await pushBoard(m.id); });
        else await serial(`b:${m.id}`, () => dropLocal(m.id));
      }
      await serial('folders', syncFolders);
      syncMedia();
      if (openId) reportOpen(openId);
    })().catch((err) => console.warn('Mapache: sincronización pendiente', err.message)).finally(() => { syncing = null; });
    return syncing;
  }

  let es = null;
  function listen() {
    if (es || typeof EventSource === 'undefined') return;
    es = new EventSource('api/events');
    es.addEventListener('hello', (e) => {
      try { info = { ...info, ...JSON.parse(e.data) }; } catch { /* sin datos */ }
      setMode('online');
      fullSync();
    });
    es.addEventListener('board', (e) => {
      const d = JSON.parse(e.data);
      if (d.deleted) serial(`b:${d.id}`, () => dropLocal(d.id));
      else serial(`b:${d.id}`, () => pullBoard(d.id, d.rev));
    });
    es.addEventListener('folders', () => serial('folders', syncFolders));
    es.addEventListener('show', (e) => emit({ type: 'open', id: JSON.parse(e.data).id }));
    es.onerror = () => { if (mode === 'online') setMode('offline'); };
  }

  // Decide al arrancar si hay servidor de Mapache. Con servidor, espera a la primera sincronización
  // (así un navegador nuevo ya muestra tus tableros).
  let readyP = null;
  function ready() {
    if (readyP) return readyP;
    readyP = (async () => {
      if (!/^https?:$/.test(location.protocol)) return mode;
      try {
        const res = await fetch('api/info', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        const data = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
        if (!data || data.app !== 'mapache') return mode; // web estática: solo este navegador
        info = data;
        setMode('online');
        await fullSync();
      } catch { setMode('offline'); }
      listen();
      return mode;
    })();
    return readyP;
  }

  let openId = null;
  function reportOpen(id) {
    openId = id;
    if (mode === 'online') call('PUT', 'api/session', { openBoard: id }).catch(() => {});
  }

  // ---------- Lo que usa la app ----------

  const Store = {
    all: () => idb.maps.all(),
    get: (id) => idb.maps.get(id),
    // `base`: el tablero (en JSON) del que parte el que guardas. Si mientras tanto llegó otra versión
    // (de tu agente, por ejemplo), se fusionan las dos y se devuelve el resultado.
    put: (m, { base } = {}) => serial(`b:${m.id}`, async () => {
      let out = m.rev !== undefined ? strip(m) : m;
      if (base) {
        const cur = await idb.maps.get(m.id);
        if (cur && JSON.stringify(cur) !== base) out = Merge.mergeBoard(JSON.parse(base), out, cur);
      }
      await idb.maps.put(out);
      if (mode !== 'local') { await markDirty(m.id); serial(`b:${m.id}`, () => pushBoard(m.id)).catch(() => {}); }
      return out;
    }),
    remove: (id) => serial(`b:${id}`, async () => {
      await idb.maps.remove(id);
      if (mode === 'local') return;
      await idb.sync.remove(`b:${id}`);
      await idb.sync.put({ key: `d:${id}` });
      serial(`b:${id}`, () => pushDelete(id)).catch(() => {});
    }),
    folders: {
      all: () => idb.folders.all(),
      get: (id) => idb.folders.get(id),
      put: async (f) => {
        await idb.folders.put(f);
        if (mode === 'local') return;
        await idb.sync.put({ key: `fp:${f.id}` });
        serial('folders', syncFolders).catch(() => {});
      },
      remove: async (id) => {
        await idb.folders.remove(id);
        if (mode === 'local') return;
        await idb.sync.remove(`fp:${id}`);
        await idb.sync.put({ key: `fd:${id}` });
        serial('folders', syncFolders).catch(() => {});
      },
    },
    media: {
      // Si el vídeo no está en este navegador (se subió desde otro), se trae del servidor.
      get: async (id) => {
        const rec = await idb.media.get(id);
        if (rec || mode !== 'online') return rec;
        try {
          const res = await call('GET', `api/media/${encodeURIComponent(id)}`);
          if (!res.ok) return undefined;
          const blob = await res.blob();
          const got = { id, blob, type: blob.type, name: decodeURIComponent(res.headers.get('x-media-name') || '') };
          await idb.media.put(got);
          await idb.sync.put({ key: `m:${id}` });
          return got;
        } catch { return undefined; }
      },
      put: async (rec) => {
        await idb.media.put(rec);
        if (mode === 'online') serial(`m:${rec.id}`, () => uploadMedia(rec)).catch(() => {});
      },
      remove: (id) => idb.media.remove(id),
    },
    // Pide al navegador que no borre estos datos al liberar espacio.
    persist: () => (navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false)),
    ready,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    status: () => ({ mode, dataDir: info && info.dataDir, version: info && info.version }),
    reportOpen,
  };

  root.MMStore = Store;
})(window);
