(function () {
  'use strict';
  const L = window.MMLayout;
  const { UI, NODE_ICONS, SIDE_ICONS, SIDE_EMOJIS } = window.MMIcons;
  const Store = window.MMStore;
  const Sidebar = window.MMSidebar;
  const Shapes = window.MMShapes;
  const Tables = window.MMTables;
  const Charts = window.MMCharts;
  const Conn = window.MMConnectors;
  const Arrange = window.MMArrange;
  const Ink = window.MMInk;
  const Merge = window.MMMerge;

  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const world = $('#world');
  const sectionsLayer = $('#sections-layer');
  const backLayer = $('#items-back');
  const frontLayer = $('#items-front');
  const gLines = $('#lines');
  const gConns = $('#conns');
  const gUI = $('#ui');
  const bar = $('#contextbar');
  const pop = $('#popover');
  const tip = $('#tooltip');
  const sizeTip = Object.assign(document.createElement('div'), { id: 'size-tip', hidden: true });
  document.querySelector('#stage').appendChild(sizeTip);
  const help = $('#help');
  const titleInput = $('#map-title');

  const uid = () => crypto.randomUUID();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const colorOf = (key) => L.PALETTE[key] || key || L.PALETTE.gray;
  const tr = (s, v) => (window.MMI18n ? window.MMI18n.t(s, v) : v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s);

  // Colores de nota (tonos apagados para el tema oscuro). Morado por defecto.
  const NOTE_COLORS = {
    purple: '#6b4fb3', blue: '#33609c', teal: '#22706b', green: '#46773d', mustard: '#94823f',
    orange: '#9c5a2c', red: '#9b3d3d', pink: '#94417a', gray: '#4b5563', white: '#e9ecef',
  };
  const TEXT_SIZES = [['S', 14, 20], ['M', 18, 26], ['L', 28, 36], ['XL', 44, 52]];
  // Formas: paleta del tema (la de las ramas) más blanco y gris. Secciones: tonos menos saturados.
  const SHAPE_COLORS = { white: '#e9ecef', gray: '#6b7685', ...Object.fromEntries(L.PALETTE_ORDER.slice(0, 10).map((k) => [k, L.PALETTE[k]])) };
  const SHAPE_STYLES = [['fill', 'Relleno'], ['border', 'Borde'], ['dashed', 'Borde discontinuo'], ['none', 'Transparente']];
  const SECTION_COLORS = { gray: '#6b7685', purple: '#7c6bc0', blue: '#5a7aa6', green: '#5b8a70', yellow: '#a3925a', orange: '#a77b58', red: '#a36262', pink: '#a06388' };
  // Colores para lo seleccionado dentro de un texto, y resaltados semitransparentes (se leen sobre cualquier fondo).
  const FMT_COLORS = { blanco: '#f8fafc', gris: '#9aa5b4', negro: '#1f2937', rojo: '#f87171', naranja: '#fb923c', amarillo: '#facc15',
    verde: '#4ade80', azul: '#60a5fa', morado: '#a78bfa', rosa: '#f472b6' };
  const FMT_HILITES = { amarillo: 'rgba(250, 204, 21, 0.38)', verde: 'rgba(74, 222, 128, 0.32)', azul: 'rgba(96, 165, 250, 0.34)',
    morado: 'rgba(167, 139, 250, 0.38)', rosa: 'rgba(244, 114, 182, 0.34)', rojo: 'rgba(248, 113, 113, 0.34)', gris: 'rgba(148, 163, 184, 0.32)' };
  // Tema: oscuro (predeterminado), claro o según el sistema. Los colores guardados en los objetos son nombres
  // (purple, white…); aquí se traduce cada nombre a su tono en cada tema.
  const THEME_COLORS = {
    dark: {
      surface: '#111821', conn: '#a3adba', ink: '#eef1f5', labelInk: '#dfe5ec', bg: '#111821', meta: '#151b23',
      notes: { purple: '#6b4fb3', blue: '#33609c', teal: '#22706b', green: '#46773d', mustard: '#94823f', orange: '#9c5a2c', red: '#9b3d3d', pink: '#94417a', gray: '#4b5563', white: '#e9ecef' },
      noteInk: (k) => (k === 'white' ? '#1d1d1f' : '#fff'),
      text: { white: '#eef1f5', gray: '#9aa5b4', purple: '#c4b5fd', blue: '#93c5fd', green: '#86efac', yellow: '#fde68a', orange: '#fdba74', red: '#fca5a5' },
      shapeWhite: '#e9ecef', shapeGray: '#6b7685', inkWhite: '#e9ecef',
    },
    light: {
      surface: '#f4f5f7', conn: '#7b8594', ink: '#1f2733', labelInk: '#2b3340', bg: '#f4f5f7', meta: '#ffffff',
      notes: { purple: '#ddd3fa', blue: '#d3e3fb', teal: '#cdeeea', green: '#d8f0cf', mustard: '#f6e9ad', orange: '#fbdcc3', red: '#f8d2d2', pink: '#f6d3e8', gray: '#e3e7ec', white: '#ffffff' },
      noteInk: () => '#1f2733',
      text: { white: '#1f2733', gray: '#5b6573', purple: '#6d28d9', blue: '#1d4ed8', green: '#15803d', yellow: '#a16207', orange: '#c2410c', red: '#b91c1c' },
      shapeWhite: '#cfd5dd', shapeGray: '#7b8594', inkWhite: '#1f2733',
    },
  };
  let theme = 'dark';

  const TEXT_COLORS = { white: '#eef1f5', gray: '#9aa5b4', purple: '#c4b5fd', blue: '#93c5fd', green: '#86efac', yellow: '#fde68a', orange: '#fdba74', red: '#fca5a5' };

  // ---------- Estado ----------
  let map = null; // { id, title, folderId, doc, createdAt, updatedAt }
  let doc = null;
  let layout = null;
  let selectedId = null; // nodo del mapa seleccionado
  let selItem = null; // objeto libre seleccionado
  let selCell = null; // celda seleccionada dentro de la tabla seleccionada: { r, c }
  const selInks = new Set(); // trazos elegidos con el lazo
  // Selección de varios elementos (recuadro o Shift+clic). `multiRoots`: mapas mentales enteros (sus raíces).
  // En la selección, un mapa se nombra 'map:<id de su raíz>'.
  const multi = new Set();
  const multiRoots = new Set();
  // Nodos sueltos de un mapa (el recuadro los toca sin tocar la raíz): se pueden borrar a la vez.
  const multiNodes = new Set();
  const MAP = 'map:';
  const mapTok = (rid) => MAP + rid;
  const tokRoot = (g) => (typeof g === 'string' && g.startsWith(MAP) ? g.slice(MAP.length) : null);
  const NODE = 'node:';
  const nodeTok = (id) => NODE + id;
  const tokNode = (g) => (typeof g === 'string' && g.startsWith(NODE) ? g.slice(NODE.length) : null);
  // Nombre en la selección de un nodo pulsado: su raíz representa el mapa entero.
  const nodeGid = (id) => (isRoot(id) ? mapTok(id) : nodeTok(id));
  const GRID = 22; // separación de los puntos del fondo, en px del lienzo
  // Colores que dependen del tema (se cambian en applyTheme).
  let CONN_COLOR = '#a3adba';
  let SURFACE = '#111821';
  let hoverId = null;
  let hoverItem = null;
  let editing = null; // { kind: 'node' | 'item', id, before }
  let drag = null;
  let spaceDown = false;
  let quickAddHidden = false;
  let clipboard = null;
  let tool = 'select';
  let mouseWorld = null;
  const view = { x: 0, y: 0, k: 1 };
  const history = { past: [], future: [] };
  const els = new Map(); // nodos: id -> { el, icon, text, sig }
  const itemEls = new Map(); // objetos: id -> { el, text, sig, layer }

  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };
  let noteColor = pref('mindmap:noteColor') || 'purple';
  // Dibujo a mano: herramienta, color, grosor y «detectar formas» se recuerdan en este navegador.
  const inkPrefs = Object.assign({ tool: 'pen', color: 'blue', thick: false, detect: false }, JSON.parse(pref('mindmap:ink') || '{}'));
  const saveInkPrefs = () => pref('mindmap:ink', JSON.stringify(inkPrefs));

  // ---------- Documento ----------

  function newDoc() {
    const rootId = uid();
    return { rootId, settings: { layout: 'horizontal', lines: 'curvy' }, nodes: { [rootId]: makeNode(rootId, null, 1, 'Idea central') }, items: {} };
  }

  function makeNode(id, parentId, order, text = '', style = {}) {
    return { id, parentId, order, lines: [esc(text)], block: 'p', checked: [], icon: null, style };
  }

  const kidsOf = (d, id) => Object.values(d.nodes).filter((n) => n.parentId === id).sort((a, b) => a.order - b.order);
  const children = (id) => kidsOf(doc, id);

  function subtreeIds(id, d = doc) {
    const out = [id];
    for (let i = 0; i < out.length; i++) for (const c of kidsOf(d, out[i])) out.push(c.id);
    return out;
  }

  const plainText = (n) => n.lines.map((l) => { const t = document.createElement('template'); t.innerHTML = l; return t.content.textContent; }).join('\n');

  // Color de rama: el menos usado (morado, azul, verde, naranja…).
  function nextColor(d = doc, rid = d.rootId) {
    const used = {};
    for (const c of kidsOf(d, rid)) used[c.style.color] = (used[c.style.color] || 0) + 1;
    let best = L.PALETTE_ORDER[0];
    for (const key of L.PALETTE_ORDER) if ((used[key] || 0) < (used[best] || 0)) best = key;
    return best;
  }

  const orderBetween = (a, b) => (a && b ? (a.order + b.order) / 2 : a ? a.order + 1 : b ? b.order - 1 : 1);
  // Varios mapas mentales por tablero: la raíz principal (doc.rootId, con doc.settings) y otras raíces (nodos sin
  // padre) que guardan su disposición, tipo de línea y posición en `node.map`.
  const rootIdsOf = (d) => [d.rootId, ...Object.keys(d.nodes).filter((id) => id !== d.rootId && d.nodes[id].parentId == null)];
  const isRoot = (id, d = doc) => !!(id && d.nodes[id] && d.nodes[id].parentId == null);
  function rootOf(id, d = doc) {
    let n = d.nodes[id];
    while (n && n.parentId != null && d.nodes[n.parentId]) n = d.nodes[n.parentId];
    return n ? n.id : d.rootId;
  }
  function mapSettings(d, rid) {
    if (rid === d.rootId || !d.nodes[rid]) return d.settings;
    const n = d.nodes[rid];
    n.map = Object.assign({ layout: 'horizontal', lines: 'curvy' }, n.map);
    n.map.origin = n.map.origin || { x: 0, y: 0 };
    return n.map;
  }
  const outerSides = (rid = rootOf(selectedId || doc.rootId)) => (mapSettings(doc, rid).layout === 'vertical' ? ['bottom', 'top'] : ['right', 'left']);

  function normalizeDoc(d) {
    if (!d || !d.nodes || !d.rootId || !d.nodes[d.rootId]) throw new Error('Mapa no válido');
    d.settings = Object.assign({ layout: 'horizontal', lines: 'curvy' }, d.settings);
    d.settings.origin = d.settings.origin || { x: 0, y: 0 };
    d.items = d.items || {};
    for (const n of Object.values(d.nodes)) {
      n.style = n.style || {};
      if (!Array.isArray(n.lines)) n.lines = [esc(n.text || '')];
      n.block = n.block || 'p';
      fixBlocks(n);
      n.checked = n.checked || [];
      if (n.parentId != null && !d.nodes[n.parentId]) delete d.nodes[n.id];
    }
    for (const r of rootIdsOf(d)) {
      mapSettings(d, r);
      for (const c of kidsOf(d, r)) if (!c.style.color) c.style.color = nextColor(d, r);
    }
    return d;
  }

  // ---------- Historial y guardado ----------

  const snapshot = () => JSON.stringify(doc);

  function commit(before) {
    if (before === snapshot()) return;
    history.past.push(before);
    if (history.past.length > 200) history.past.shift();
    history.future = [];
    saveSoon();
  }

  function mutate(fn) {
    const before = snapshot();
    const out = fn();
    commit(before);
    render();
    return out;
  }

  function restore(json) {
    doc = JSON.parse(json);
    if (!doc.nodes[selectedId]) selectedId = null;
    if (selItem && !doc.items[selItem]) selItem = null;
    saveSoon();
    render();
  }

  function undo() {
    if (editing) commitEdit();
    if (!history.past.length) return;
    history.future.push(snapshot());
    restore(history.past.pop());
  }

  function redo() {
    if (editing) commitEdit();
    if (!history.future.length) return;
    history.past.push(snapshot());
    restore(history.future.pop());
  }

  let saveTimer = null;
  function saveSoon() {
    $('#save-state').textContent = 'Guardando…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 350);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!map) return;
    map.doc = doc;
    map.updatedAt = Date.now();
    try {
      // Si mientras tanto otro cambió el tablero (tu agente, otra pestaña), el almacén junta los dos cambios.
      const rec = JSON.parse(JSON.stringify(map));
      const saved = await Store.put(rec, { base: syncBase });
      if (saved !== rec) {
        if (editing || (drag && drag.active) || saveTimer) syncBase = JSON.stringify(rec); // se aplicará al terminar
        else applyBoard(saved);
      } else syncBase = JSON.stringify(saved);
      $('#save-state').textContent = 'Guardado';
    } catch (err) {
      $('#save-state').textContent = `No se pudo guardar: ${err.message}`;
    }
    await Sidebar.refresh();
    updateHeader();
  }

  // ---------- Cambios que llegan de fuera (tu agente de IA, otra pestaña u otro navegador) ----------

  // JSON del tablero tal como está guardado: de ahí parte lo que hay en pantalla. Si lo guardado cambia por otro
  // lado, se nota porque deja de coincidir.
  let syncBase = null;
  let remotePending = false;

  // Pone en pantalla otra versión del tablero abierto, sin mover la vista. Se puede deshacer con Ctrl+Z.
  function applyBoard(b) {
    const before = snapshot();
    syncBase = JSON.stringify(b);
    const next = normalizeDoc(JSON.parse(JSON.stringify(b.doc)));
    Object.assign(map, JSON.parse(JSON.stringify(b)));
    map.doc = next;
    if (JSON.stringify(next) === before) { map.doc = doc; updateHeader(); return; }
    doc = next;
    history.past.push(before);
    if (history.past.length > 200) history.past.shift();
    history.future = [];
    if (selectedId && !doc.nodes[selectedId]) selectedId = null;
    if (selItem && !doc.items[selItem]) selItem = null;
    for (const s of [multi, multiRoots, multiNodes]) for (const id of [...s]) if (!doc.items[id] && !doc.nodes[id]) s.delete(id);
    render();
    updateHeader();
  }

  // Mira si lo guardado cambió; si estás escribiendo o arrastrando, espera a que termines.
  async function checkRemote() {
    if (!map) return;
    if (editing || (drag && drag.active) || saveTimer || switching) { remotePending = true; return; }
    remotePending = false;
    const cur = await Store.get(map.id);
    if (!cur || editing || (drag && drag.active) || saveTimer) { if (cur) remotePending = true; return; }
    if (JSON.stringify(cur) !== syncBase) applyBoard(cur);
  }
  setInterval(() => { if (remotePending) checkRemote(); }, 400);

  Store.on(async (e) => {
    if (e.type === 'board') {
      if (map && e.id === map.id) {
        if (e.deleted && !saveTimer) {
          toast(tr('Este tablero se ha movido a la papelera desde fuera de la app'));
          const rest = (await Store.all()).sort((a, b) => b.updatedAt - a.updatedAt);
          map = null;
          if (rest.length) await openMap(rest[0].id); else await createMap(null);
          return;
        }
        if (!e.deleted) await checkRemote();
      }
      Sidebar.refresh();
    } else if (e.type === 'folders') Sidebar.refresh();
    else if (e.type === 'open' && e.id) {
      if (await Store.get(e.id)) { if (!map || map.id !== e.id) await openMap(e.id); window.focus(); }
    } else if (e.type === 'status') updateSaveTip();
  });

  // Dónde se guarda: en los archivos de tu ordenador (con servidor) o solo en este navegador.
  function updateSaveTip() {
    const s = Store.status();
    const el = $('#save-state');
    el.title = s.mode === 'online' ? tr('Tus tableros se guardan en {dir}', { dir: s.dataDir || '~/.mapache' })
      : s.mode === 'offline' ? tr('Sin conexión con Mapache: se guarda en este navegador y se sincroniza al volver')
        : tr('Se guarda en este navegador');
    el.classList.toggle('offline', s.mode === 'offline');
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });
  window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });

  // ---------- Comandos del mapa ----------

  function insertNode(parentId, order, style = {}) {
    const id = uid();
    doc.nodes[id] = makeNode(id, parentId, order, '', style);
    return id;
  }

  function addChild(pid = selectedId, side = null) {
    if (!pid) return;
    if (editing) commitEdit();
    const before = snapshot();
    const p = doc.nodes[pid];
    delete p.style.collapsed;
    const ks = children(pid);
    const style = {};
    if (isRoot(pid)) {
      style.color = nextColor(doc, pid);
      if (side && side !== outerSides(pid)[0]) style.side = side;
    }
    const id = insertNode(pid, ks.length ? ks[ks.length - 1].order + 1 : 1, style);
    selectNode(id, false);
    startEdit(id, { before });
  }

  function addSibling(id = selectedId, above = false) {
    if (!id) return;
    if (isRoot(id)) return addChild(id);
    if (editing) commitEdit();
    const before = snapshot();
    const cur = doc.nodes[id];
    const sibs = children(cur.parentId);
    const i = sibs.indexOf(cur);
    const order = above ? orderBetween(sibs[i - 1], cur) : orderBetween(cur, sibs[i + 1]);
    const style = isRoot(cur.parentId) ? { color: nextColor(doc, cur.parentId), ...(cur.style.side ? { side: cur.style.side } : {}) } : {};
    const nid = insertNode(cur.parentId, order, style);
    selectNode(nid, false);
    startEdit(nid, { before });
  }

  function addParent(id = selectedId) {
    if (!id || isRoot(id)) return;
    if (editing) commitEdit();
    const before = snapshot();
    const cur = doc.nodes[id];
    const style = {};
    if (isRoot(cur.parentId)) {
      for (const k of ['color', 'side']) if (cur.style[k]) { style[k] = cur.style[k]; delete cur.style[k]; }
    }
    const nid = insertNode(cur.parentId, cur.order, style);
    cur.parentId = nid;
    cur.order = 1;
    selectNode(nid, false);
    startEdit(nid, { before });
  }

  function deleteNode(id = selectedId) {
    if (!id || id === doc.rootId) return;
    // La raíz de un mapa que no es el principal: se borra el mapa entero.
    if (isRoot(id)) {
      mutate(() => { const ids = subtreeIds(id); detachConns(new Set(ids.map((x) => `node:${x}`))); for (const d of ids) delete doc.nodes[d]; });
      selectedId = null;
      return render();
    }
    const cur = doc.nodes[id];
    const sibs = children(cur.parentId);
    const i = sibs.indexOf(cur);
    const next = (sibs[i + 1] || sibs[i - 1] || doc.nodes[cur.parentId]).id;
    mutate(() => { const ids = subtreeIds(id); detachConns(new Set(ids.map((x) => `node:${x}`))); for (const d of ids) delete doc.nodes[d]; });
    selectNode(next);
  }

  function cloneSubtree(srcDoc, id) {
    return { rootId: id, nodes: subtreeIds(id, srcDoc).map((i) => JSON.parse(JSON.stringify(srcDoc.nodes[i]))) };
  }

  // Inserta una rama copiada bajo parentId con ids nuevos. Devuelve el id de su raíz.
  function insertClone(clip, parentId, order) {
    const ids = {};
    for (const n of clip.nodes) ids[n.id] = uid();
    for (const n of clip.nodes) {
      const copy = JSON.parse(JSON.stringify(n));
      copy.id = ids[n.id];
      if (n.id === clip.rootId) { copy.parentId = parentId; copy.order = order; }
      else copy.parentId = ids[n.parentId];
      doc.nodes[copy.id] = copy;
    }
    const top = doc.nodes[ids[clip.rootId]];
    if (parentId != null) delete top.map;
    if (isRoot(parentId)) top.style.color = nextColor(doc, parentId);
    else { delete top.style.color; delete top.style.side; }
    return top.id;
  }

  // Duplicar la raíz duplica el mapa entero, debajo del original.
  function duplicateMindmap(rid) {
    const s = mapSettings(doc, rid);
    const b = layout.roots[rid] ? layout.roots[rid].bounds : { h: 200 };
    const clip = cloneSubtree(doc, rid);
    const nid = mutate(() => {
      const n = insertClone(clip, null, 1);
      doc.nodes[n].map = { layout: s.layout, lines: s.lines, origin: { x: s.origin.x, y: Math.round(s.origin.y + b.h + 80) } };
      return n;
    });
    selectNode(nid);
  }

  function duplicate(id = selectedId) {
    if (!id) return;
    if (isRoot(id)) return duplicateMindmap(id);
    const cur = doc.nodes[id];
    const sibs = children(cur.parentId);
    const clip = cloneSubtree(doc, id);
    const nid = mutate(() => {
      const n = insertClone(clip, cur.parentId, orderBetween(cur, sibs[sibs.indexOf(cur) + 1]));
      if (cur.style.side && isRoot(cur.parentId)) doc.nodes[n].style.side = cur.style.side;
      return n;
    });
    selectNode(nid);
  }

  function toggleCollapse(id = selectedId) {
    if (!id) return;
    if (isRoot(id)) return collapseBranches(id);
    if (!children(id).length) return;
    mutate(() => {
      const s = doc.nodes[id].style;
      if (s.collapsed) delete s.collapsed; else s.collapsed = true;
    });
  }

  // Botón de plegar en la raíz: pliega o despliega todas sus ramas.
  function collapseBranches(rid = doc.rootId) {
    const ks = children(rid).filter((c) => children(c.id).length);
    const anyOpen = ks.some((c) => !c.style.collapsed);
    mutate(() => { for (const c of ks) { if (anyOpen) c.style.collapsed = true; else delete c.style.collapsed; } });
  }

  function indent(id = selectedId) {
    if (!id || isRoot(id)) return;
    const cur = doc.nodes[id];
    const sibs = children(cur.parentId);
    const prev = sibs[sibs.indexOf(cur) - 1];
    if (prev) moveTo(id, { parentId: prev.id, beforeId: null });
  }

  function outdent(id = selectedId) {
    if (!id || isRoot(id)) return;
    const cur = doc.nodes[id];
    if (isRoot(cur.parentId)) return;
    const parent = doc.nodes[cur.parentId];
    const psibs = children(parent.parentId);
    const after = psibs[psibs.indexOf(parent) + 1];
    moveTo(id, { parentId: parent.parentId, beforeId: after ? after.id : null, side: parent.style.side });
  }

  // Mueve una rama: { parentId, beforeId (null = al final), side }.
  function applyMove(d, id, slot) {
    const n = d.nodes[id];
    const sibs = kidsOf(d, slot.parentId).filter((k) => k.id !== id);
    const beforeIdx = slot.beforeId ? sibs.findIndex((k) => k.id === slot.beforeId) : sibs.length;
    n.parentId = slot.parentId;
    n.order = orderBetween(sibs[beforeIdx - 1], sibs[beforeIdx]);
    delete d.nodes[slot.parentId].style.collapsed;
    if (isRoot(slot.parentId, d)) {
      if (!n.style.color) n.style.color = nextColor(d, slot.parentId);
      if (slot.side) n.style.side = slot.side;
    } else {
      delete n.style.color;
      delete n.style.side;
    }
  }

  function moveTo(id, slot) {
    mutate(() => applyMove(doc, id, slot));
    selectNode(id);
  }

  function setStyle(id, key, value) {
    mutate(() => {
      const s = doc.nodes[id].style;
      if (value == null) delete s[key]; else s[key] = value;
    });
  }

  function setLayout(value) {
    const rid = rootOf(selectedId || doc.rootId);
    if (mapSettings(doc, rid).layout === value) return;
    mutate(() => {
      const from = outerSides(rid);
      mapSettings(doc, rid).layout = value;
      const to = outerSides(rid);
      for (const c of children(rid)) if (c.style.side) c.style.side = c.style.side === from[1] ? to[1] : to[0];
    });
    if (layout.roots[rid]) ensureVisibleRect(layout.roots[rid].bounds);
  }

  // Mapa mental nuevo en el tablero (herramienta M): una raíz más, centrada donde se pulsa.
  function createMindmap(at) {
    if (editing) commitEdit();
    const before = snapshot();
    const id = uid();
    doc.nodes[id] = makeNode(id, null, 1, 'Idea central');
    doc.nodes[id].map = { layout: 'horizontal', lines: 'curvy', origin: { x: Math.round(at.x), y: Math.round(at.y) } };
    setTool('select');
    selectNode(id, false);
    startEdit(id, { before });
  }

  // Tipo de bloque de cada línea (título, lista…). `blocks` solo existe si las líneas son de tipos distintos;
  // si no, todas usan `block`.
  const blockAt = (t, i) => (t.blocks && t.blocks[i]) || t.block || 'p';
  function setBlocks(t, list) {
    if (!list.length || list.every((b) => b === list[0])) { t.block = list[0] || 'p'; delete t.blocks; }
    else { t.blocks = list; t.block = list[0]; }
  }
  function fixBlocks(t) {
    if (!t || !t.lines) return;
    if (t.blocks) setBlocks(t, t.lines.map((_, i) => t.blocks[i] || t.block || 'p'));
    t.checked = t.checked || [];
  }

  // Objeto con texto seleccionado (nodo, nota o texto libre).
  const textTarget = () => (selItem ? doc.items[selItem] : selectedId ? doc.nodes[selectedId] : null);

  // Líneas del editor que toca la selección (o la del cursor).
  function selectedLines(el) {
    const sel = getSelection();
    if (!sel.rangeCount || !el) return [];
    const r = sel.getRangeAt(0);
    const lns = [...el.children].filter((c) => c.classList.contains('ln'));
    const hit = lns.filter((ln) => r.intersectsNode(ln));
    // Una selección que acaba justo al principio de la línea siguiente no la incluye.
    if (hit.length > 1) {
      const last = hit[hit.length - 1], pre = document.createRange();
      pre.setStart(last, 0);
      pre.setEnd(r.endContainer, r.endOffset);
      if (!pre.toString()) hit.pop();
    }
    return hit;
  }
  const lineBlock = (ln) => (ln.className.match(/\bb-(\w+)/) || [])[1] || 'p';
  function setLineBlock(ln, b) { ln.className = `ln b-${b}${b === 'check' && ln.classList.contains('done') ? ' done' : ''}`; }

  // Mientras se escribe: a las líneas seleccionadas. Si no se está editando: a todo el texto.
  // Volver a elegir el mismo tipo lo quita (vuelve a párrafo).
  function setBlock(block) {
    const t = textTarget();
    if (!t || !t.lines) return;
    const el = editing && editing.kind !== 'cell' ? editEl() : null;
    const lns = el ? selectedLines(el) : [];
    if (lns.length) {
      const nb = lns.every((ln) => lineBlock(ln) === block) && block !== 'p' ? 'p' : block;
      for (const ln of lns) setLineBlock(ln, nb);
      return onEditorInput();
    }
    const all = t.lines.every((_, i) => blockAt(t, i) === block);
    mutate(() => setBlocks(t, t.lines.map(() => (all && block !== 'p' ? 'p' : block))));
  }

  // Bloque que mostrar como activo en la barra: el de la línea del cursor, o el de todas si coinciden.
  function curBlock(t) {
    const el = editing && editing.kind !== 'cell' ? editEl() : null;
    const lns = el ? selectedLines(el) : [];
    if (lns.length) return lns.every((ln) => lineBlock(ln) === lineBlock(lns[0])) ? lineBlock(lns[0]) : null;
    return t.blocks ? null : t.block;
  }

  // ---------- Texto enriquecido ----------

  const ALLOWED = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', S: 's', STRIKE: 's', DEL: 's', CODE: 'code', MARK: 'mark', A: 'a', BR: 'br', SPAN: 'span', FONT: 'span' };
  const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;

  function sanitize(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    const walk = (node) => {
      let out = '';
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { out += esc(c.textContent); continue; }
        if (c.nodeType !== 1) continue;
        const tag = ALLOWED[c.tagName];
        const inner = walk(c);
        if (!tag) out += inner;
        else if (tag === 'br') out += '<br>';
        else if (tag === 'span') {
          // Solo se conservan el color del texto y el del resaltado.
          const color = c.tagName === 'FONT' ? c.getAttribute('color') || '' : c.style.color;
          const bg = c.style.backgroundColor;
          const st = [SAFE_COLOR.test(color) ? `color:${color}` : '', SAFE_COLOR.test(bg) ? `background-color:${bg}` : ''].filter(Boolean).join(';');
          out += st && inner ? `<span style="${st}">${inner}</span>` : inner;
        }
        else if (tag === 'a') {
          const href = c.getAttribute('href') || '';
          out += /^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>` : inner;
        } else if (inner) out += `<${tag}>${inner}</${tag}>`;
      }
      return out;
    };
    return walk(t.content).replace(/(<br>)+$/, '');
  }

  const contentHTML = (n) => n.lines.map((l, i) => {
    const b = blockAt(n, i);
    return `<div class="ln b-${b}${b === 'check' && n.checked && n.checked[i] ? ' done' : ''}">${l || '<br>'}</div>`;
  }).join('');

  // Lee del editor el texto, el tipo de bloque y si está marcada cada línea (siguen juntos al partir o unir líneas).
  function readEditorAll(textEl, fallback = 'p') {
    const lines = [], blocks = [], checked = [];
    for (const c of textEl.childNodes) {
      if (c.nodeType === 3) {
        if (c.textContent.trim()) { lines.push(esc(c.textContent)); blocks.push(fallback); checked.push(false); }
      } else if (c.nodeType === 1) {
        lines.push(sanitize(c.tagName === 'BR' ? '' : c.innerHTML));
        const b = c.classList.contains('ln') ? lineBlock(c) : fallback;
        blocks.push(b);
        checked.push(b === 'check' && c.classList.contains('done'));
      }
    }
    return lines.length ? { lines, blocks, checked } : { lines: [''], blocks: [fallback], checked: [] };
  }
  function storeEditor(target, el) {
    const r = readEditorAll(el, blockAt(target, 0));
    target.lines = r.lines;
    setBlocks(target, r.blocks);
    target.checked = r.checked;
  }

  function readEditor(textEl) {
    const lines = [];
    for (const c of textEl.childNodes) {
      if (c.nodeType === 3) { if (c.textContent.trim()) lines.push(esc(c.textContent)); }
      else if (c.nodeType === 1) lines.push(sanitize(c.tagName === 'BR' ? '' : c.innerHTML));
    }
    return lines.length ? lines : [''];
  }

  // ---------- Dibujo del mapa ----------

  function visibleIds(d, rid = d.rootId) {
    const out = [];
    (function walk(id) {
      out.push(id);
      if (d.nodes[id].style.collapsed && d.nodes[id].parentId != null) return;
      for (const c of kidsOf(d, id)) walk(c.id);
    })(rid);
    return out;
  }

  function syncNode(d, id, level, root) {
    const n = d.nodes[id];
    let rec = els.get(id);
    if (!rec) {
      const el = document.createElement('div');
      el.className = 'mm-node';
      el.dataset.id = id;
      el.innerHTML = '<span class="icon" hidden></span><div class="mm-text"></div>';
      world.appendChild(el);
      rec = { el, icon: el.firstChild, text: el.lastChild, sig: '' };
      els.set(id, rec);
    }
    const isEditing = editing && editing.kind === 'node' && editing.id === id;
    const empty = n.lines.every((l) => !l);
    const cls = ['mm-node', `lvl-${Math.min(level, 2)}`];
    if (id === selectedId) cls.push('selected');
    const picked = inSel(mapTok(root)) || inSel(nodeTok(id));
    if (picked) cls.push('in-sel');
    if (id === hoverId && id !== selectedId && !picked) cls.push('hover');
    if (isEditing) cls.push('editing');
    if (drag && drag.active && drag.ids && drag.ids.has(id)) cls.push('dragging');
    rec.el.className = cls.join(' ');
    rec.text.className = `mm-text tag-${blockAt(n, 0)}${empty ? ' empty' : ''}`;
    rec.icon.hidden = !n.icon;
    rec.icon.textContent = n.icon || '';
    const sig = `${n.block}|${(n.blocks || []).join(',')}|${n.lines.join('\u0001')}|${n.checked.join(',')}`;
    if (!isEditing && sig !== rec.sig) {
      rec.text.innerHTML = contentHTML(n);
      rec.sig = sig;
    }
    return rec;
  }

  function render(d = doc) {
    const roots = rootIdsOf(d);
    const vis = [], levels = {}, rootFor = {};
    for (const r of roots) {
      vis.push(...visibleIds(d, r));
      (function lv(id, l) { levels[id] = l; rootFor[id] = r; for (const c of kidsOf(d, id)) lv(c.id, l + 1); })(r, 0);
    }
    const visSet = new Set(vis);
    for (const [id, rec] of els) if (!visSet.has(id)) { rec.el.remove(); els.delete(id); }
    const recs = vis.map((id) => [id, syncNode(d, id, levels[id], rootFor[id])]);
    const sizes = new Map();
    for (const [id, rec] of recs) sizes.set(id, { w: rec.el.offsetWidth, h: rec.el.offsetHeight });
    // Cada mapa se calcula alrededor de (0,0) con su disposición y se desplaza a su origen (se mueve arrastrando la raíz).
    layout = { boxes: {}, connectors: [], vertical: false, bounds: null, roots: {} };
    const lines = [];
    for (const r of roots) {
      const s = mapSettings(d, r);
      const lay = L.computeLayout({ rootId: r, settings: s, nodes: d.nodes }, (id) => sizes.get(id));
      const o = s.origin || { x: 0, y: 0 };
      for (const b of Object.values(lay.boxes)) {
        if (b.visible) { b.x += o.x; b.y += o.y; }
        b.vertical = lay.vertical;
        b.root = r;
        layout.boxes[b.id] = b;
      }
      layout.roots[r] = { bounds: { ...lay.bounds, x: lay.bounds.x + o.x, y: lay.bounds.y + o.y }, vertical: lay.vertical };
      if (r === d.rootId) layout.vertical = lay.vertical;
      layout.connectors.push(...lay.connectors);
      lines.push(`<g transform="translate(${o.x},${o.y})">${lay.connectors.map((c) =>
        `<path d="${c.d}" fill="none" stroke="${colorOf(c.color)}" stroke-width="${c.width}" stroke-linecap="round" stroke-linejoin="round"${c.dash ? ' stroke-dasharray="1 9"' : ''}/>`).join('')}</g>`);
    }
    layout.bounds = unionRect(Object.values(layout.roots).map((x) => x.bounds));
    for (const [id, rec] of recs) {
      const b = layout.boxes[id];
      rec.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    }
    renderItems();
    gLines.innerHTML = lines.join('');
    drawUI();
    applyView();
    updateContextbar();
  }

  // Punto a `dist` px del borde exterior del nodo, sobre su línea.
  function outerPoint(b, dist, dir = b.dir) {
    const v = b.vertical;
    if (b.level === 0) {
      return v ? { x: b.x + b.w / 2, y: dir > 0 ? b.y + b.h + dist : b.y - dist }
        : { x: dir > 0 ? b.x + b.w + dist : b.x - dist, y: b.y + b.h / 2 };
    }
    const cross = L.anchorCross(b, v);
    const edge = L.outerEdge(b, v);
    return v ? { x: cross, y: edge + dir * dist } : { x: edge + dir * dist, y: cross };
  }

  const qaDot = (p, attrs, tipText) => `<g class="hot qa" ${attrs} data-tip="${tipText}">` +
    `<circle cx="${p.x}" cy="${p.y}" r="13" fill="transparent"/><circle class="qa-dot" cx="${p.x}" cy="${p.y}" r="4"/>` +
    `<path class="qa-plus" d="M${p.x - 4.5},${p.y}h9M${p.x},${p.y - 4.5}v9"/></g>`;

  function drawUI() {
    const parts = [];
    for (const b of Object.values(layout.boxes)) {
      if (!b.visible || !b.children.length || b.level === 0) continue;
      const v = b.vertical;
      const color = colorOf(b.color);
      if (b.collapsed) {
        const label = String(b.hidden);
        const w = Math.max(20, label.length * 7 + 12);
        const c = outerPoint(b, 8 + (v ? 10 : w / 2));
        const s = outerPoint(b, 0);
        parts.push(`<line x1="${s.x}" y1="${s.y}" x2="${c.x}" y2="${c.y}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>` +
          `<g class="hot" data-toggle="${b.id}"><rect x="${c.x - w / 2}" y="${c.y - 10}" width="${w}" height="20" rx="10" fill="${color}"/>` +
          `<text x="${c.x}" y="${c.y + 4}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="11.5" font-weight="700" fill="#fff">${label}</text></g>`);
      } else if (b.id === hoverId || b.id === selectedId) {
        const c = outerPoint(b, 20);
        parts.push(`<g class="hot" data-toggle="${b.id}"><circle cx="${c.x}" cy="${c.y}" r="12" fill="transparent"/>` +
          `<circle cx="${c.x}" cy="${c.y}" r="7" fill="#111821" stroke="${color}" stroke-width="3"/></g>`);
      }
    }
    const busy = drag && (drag.active || (drag.kind && drag.moving));
    const sel = selectedId && layout.boxes[selectedId];
    if (sel && sel.visible && !quickAddHidden && !busy) {
      const v = sel.vertical;
      if (sel.level === 0) {
        const [a, b2] = outerSides(sel.id);
        parts.push(qaDot(outerPoint(sel, 20, 1), `data-qa="child" data-side="${a}"`, 'Añadir hijo · Tab'));
        parts.push(qaDot(outerPoint(sel, 20, -1), `data-qa="child" data-side="${b2}"`, 'Añadir hijo · Tab'));
      } else {
        parts.push(qaDot(outerPoint(sel, sel.children.length ? 48 : 20), 'data-qa="child"', 'Añadir hijo · Tab'));
        const p = v ? { x: sel.x + sel.w + 17, y: sel.y + sel.h / 2 } : { x: sel.x + sel.w / 2, y: sel.y + sel.h + 17 };
        parts.push(qaDot(p, 'data-qa="sibling"', 'Añadir hermano · Enter'));
      }
    }
    // Tablas: + en el borde derecho (columna) y en el inferior (fila).
    const tb = selItem && doc.items[selItem];
    if (tb && tb.type === 'table' && !tb.locked && !busy) {
      const r = itemRect(tb.id);
      if (r) {
        parts.push(qaDot({ x: r.x + r.w + 18, y: r.y + r.h / 2 }, 'data-qa="tbl-col"', 'Añadir columna'));
        parts.push(qaDot({ x: r.x + r.w / 2, y: r.y + r.h + 18 }, 'data-qa="tbl-row"', 'Añadir fila'));
      }
    }
    // Notas: puntos de añadir otra nota a cada lado .
    const it = selItem && doc.items[selItem];
    if (it && it.type === 'note' && !it.locked && !quickAddHidden && !busy && !(editing && editing.kind === 'item')) {
      const r = itemRect(it.id);
      if (r) {
        const pts = { right: [r.x + r.w + 20, r.y + r.h / 2], left: [r.x - 20, r.y + r.h / 2], down: [r.x + r.w / 2, r.y + r.h + 20], up: [r.x + r.w / 2, r.y - 20] };
        for (const [dir, [x, y]] of Object.entries(pts)) parts.push(qaDot({ x, y }, `data-qa="note" data-dir="${dir}"`, 'Añadir nota · Alt flecha'));
      }
    }
    parts.push(...connectorUI(busy));
    parts.push(...multiUI());
    parts.push(...guideLines());
    gUI.innerHTML = parts.join('');
  }

  // Recuadro de selección y marco de lo seleccionado (los conectores elegidos se resaltan en su color).
  function multiUI() {
    const out = [];
    const k = view.k;
    const marquee = drag && drag.kind === 'marquee' && drag.rect;
    if (marquee) {
      const m = drag.rect;
      out.push(`<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" fill="rgb(167 139 250 / 0.06)" stroke="#8b5cf6" stroke-opacity="0.75" stroke-width="${1 / k}"/>`);
    }
    if (!marquee && multiCount() < 2) return out;
    const ids = marquee ? [...drag.hits.set] : [...multi];
    for (const id of ids) {
      const c = doc.items[id];
      if (c && c.type === 'conn') { const g = connGeom(c); if (g) out.push(`<path d="${g.d}" fill="none" stroke="#a78bfa" stroke-width="${connWidth(c) + 1 / k}" stroke-linecap="round" stroke-linejoin="round"/>`); }
    }
    const b = multiBounds();
    if (b && (ids.length + (marquee ? drag.hits.roots.size + drag.hits.nodes.size : multiRoots.size + multiNodes.size)) > 0) {
      const pad = 4 / k;
      out.push(`<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" fill="none" stroke="#a78bfa" stroke-width="${2 / k}"/>`);
      // Las esquinas escalan objetos y mapas; los nodos sueltos no se escalan.
      if (!marquee && !(drag && drag.moving) && (multi.size || multiRoots.size)) {
        const s = 9 / k, hit = 20 / k;
        const corners = { nw: [b.x - pad, b.y - pad], ne: [b.x + b.w + pad, b.y - pad], sw: [b.x - pad, b.y + b.h + pad], se: [b.x + b.w + pad, b.y + b.h + pad] };
        for (const [c, [x, y]] of Object.entries(corners)) {
          out.push(`<g class="hot" data-mscale="${c}" style="cursor:${c === 'nw' || c === 'se' ? 'nwse' : 'nesw'}-resize"><rect x="${x - hit / 2}" y="${y - hit / 2}" width="${hit}" height="${hit}" fill="transparent"/>` +
            `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${2 / k}" fill="${SURFACE}" stroke="#a78bfa" stroke-width="${1.5 / k}"/></g>`);
        }
      }
    }
    return out;
  }

  // Asas del conector seleccionado, puntos de las formas, selección de trazos y vistas previas al arrastrar.
  function connectorUI(busy) {
    const out = [];
    const k = view.k;
    const sel = selItem && doc.items[selItem];
    if (sel && sel.type === 'conn') {
      const g = connGeom(sel);
      if (g) {
        out.push(`<path d="${g.d}" fill="none" stroke="#a78bfa" stroke-width="${connWidth(sel) + 2 / k}" stroke-linecap="round" stroke-opacity="0.85"/>`);
        for (const [end, p] of sel.locked ? [] : [['from', g.a.p], ['to', g.b.p]]) {
          out.push(`<g class="hot" data-cend="${end}"><circle cx="${p[0]}" cy="${p[1]}" r="${12 / k}" fill="transparent"/>` +
            `<circle cx="${p[0]}" cy="${p[1]}" r="${5 / k}" fill="${SURFACE}" stroke="#a78bfa" stroke-width="${2 / k}"/></g>`);
        }
        if ((sel.route || 'elbow') === 'elbow' && (sel.from.ref || sel.to.ref) && !busy && !sel.locked) {
          // Cada tramo se coge por la propia línea; los largos llevan además un asa visible en el centro.
          const s = g.samples;
          for (let i = 0; i < s.length - 1; i++) {
            const [x0, y0] = s[i], [x1, y1] = s[i + 1];
            const vertical = Math.abs(x0 - x1) < 0.5;
            const len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
            if (len < 8 / k) continue;
            const pad = 7 / k, trim = Math.min(14 / k, len / 4);
            const rx = vertical ? x0 - pad : Math.min(x0, x1) + trim, ry = vertical ? Math.min(y0, y1) + trim : y0 - pad;
            const rw = vertical ? pad * 2 : len - trim * 2, rh = vertical ? len - trim * 2 : pad * 2;
            let grip = '';
            if (len > 44 / k) {
              const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, w = (vertical ? 8 : 18) / k, h = (vertical ? 18 : 8) / k;
              grip = `<rect x="${mx - w / 2}" y="${my - h / 2}" width="${w}" height="${h}" rx="${3 / k}" fill="${SURFACE}" stroke="#a78bfa" stroke-width="${2 / k}"/>`;
            }
            out.push(`<g class="hot" data-cseg="${i}" style="cursor:${vertical ? 'ew-resize' : 'ns-resize'}"><rect x="${rx}" y="${ry}" width="${Math.max(0, rw)}" height="${Math.max(0, rh)}" fill="transparent"/>${grip}</g>`);
          }
        }
      }
    }
    // Formas: puntos a los cuatro lados; clic = forma conectada nueva, arrastrar = conector.
    if (sel && sel.type === 'shape' && !sel.locked && !busy && !quickAddHidden && !(editing && editing.kind === 'item')) {
      const r = itemRect(sel.id);
      if (r) {
        const pts = { right: [r.x + r.w + 20, r.y + r.h / 2], left: [r.x - 20, r.y + r.h / 2], down: [r.x + r.w / 2, r.y + r.h + 20], up: [r.x + r.w / 2, r.y - 20] };
        for (const [dir, [x, y]] of Object.entries(pts)) out.push(qaDot({ x, y }, `data-qa="shape" data-dir="${dir}"`, 'Clic: forma conectada · Arrastrar: conector'));
      }
    }
    if (selInks.size) {
      const b = selInkBounds();
      if (b) out.push(`<rect class="hot" data-inksel="1" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${6 / k}" fill="rgb(167 139 250 / 0.06)" stroke="#a78bfa" stroke-width="${1.5 / k}" stroke-dasharray="${5 / k} ${4 / k}" style="cursor:move"/>`);
    }
    const anchors = (t, p) => {
      const r = t.rect, side = Conn.nearestSide(r, [p.x, p.y]);
      out.push(`<rect x="${r.x - 4}" y="${r.y - 4}" width="${r.w + 8}" height="${r.h + 8}" rx="6" fill="none" stroke="#a78bfa" stroke-width="${2 / k}"/>`);
      const at = { top: [r.x + r.w / 2, r.y], right: [r.x + r.w, r.y + r.h / 2], bottom: [r.x + r.w / 2, r.y + r.h], left: [r.x, r.y + r.h / 2] };
      for (const [sd, [x, y]] of Object.entries(at)) {
        const on = sd === side;
        out.push(`<circle cx="${x}" cy="${y}" r="${(on ? 6 : 4) / k}" fill="${on ? '#a78bfa' : SURFACE}" stroke="#a78bfa" stroke-width="${2 / k}"/>`);
      }
    };
    if (drag && drag.kind === 'newconn' && drag.cur) {
      if (drag.hover) anchors(drag.hover, drag.cur);
      const preview = { from: drag.from, to: endFor(drag.hover, drag.cur), route: 'elbow' };
      const g = connOk(preview) && Conn.geometry(preview, refRect);
      if (g) out.push(`<path d="${g.d}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round"/>`, Conn.cap('arrow', g.b.p, g.endDir, '#a78bfa', 2, SURFACE));
    }
    if (drag && drag.kind === 'conn-end' && drag.hover && drag.cur) anchors(drag.hover, drag.cur);
    if (drag && drag.kind === 'ink' && drag.pts.length > 1) {
      out.push(`<path d="${Ink.smoothPath(drag.pts)}" fill="none" stroke="${inkColor(inkPrefs.color)}" stroke-width="${drag.width}" stroke-linecap="round" stroke-linejoin="round"${drag.hl ? ' stroke-opacity="0.38"' : ''}/>`);
    }
    if (drag && drag.kind === 'lasso' && drag.poly.length > 1) {
      out.push(`<path d="M${drag.poly.map((p) => p.join(',')).join('L')}Z" fill="rgb(167 139 250 / 0.08)" stroke="#a78bfa" stroke-width="${1.5 / k}" stroke-dasharray="${5 / k} ${4 / k}"/>`);
    }
    if (drag && drag.kind === 'erase' && drag.at) {
      out.push(`<circle cx="${drag.at.x}" cy="${drag.at.y}" r="${10 / k}" fill="rgb(255 255 255 / 0.1)" stroke="#fff" stroke-width="${1 / k}"/>`);
    }
    return out;
  }

  function applyView() {
    const t = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    for (const el of [world, sectionsLayer, backLayer, frontLayer]) {
      el.style.transform = t;
      el.style.setProperty('--ik', String(1 / view.k));
    }
    const g = `translate(${view.x},${view.y}) scale(${view.k})`;
    gLines.setAttribute('transform', g);
    gUI.setAttribute('transform', g);
    gConns.setAttribute('transform', g);
    $('#zoom-label').textContent = `${Math.round(view.k * 100)}%`;
    let gs = GRID * view.k;
    while (gs < 11) gs *= 2;
    stage.style.backgroundSize = `${gs}px ${gs}px`;
    stage.style.backgroundPosition = `${view.x - gs / 2}px ${view.y - gs / 2}px`;
    positionContextbar();
  }

  const stageRect = () => stage.getBoundingClientRect();
  const toWorld = (cx, cy) => {
    const r = stageRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };
  const viewCenter = () => { const r = stageRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };

  // Límites de todo el contenido: mapa y objetos libres.
  function contentBounds() {
    const b = { ...layout.bounds };
    let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
    for (const id of Object.keys(doc.items)) {
      const r = itemRect(id);
      if (!r) continue;
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  let pendingFit = false;
  function fit() {
    const r = stageRect();
    // Si la ventana aún no tiene tamaño (pestaña oculta al cargar), se ajusta cuando lo tenga.
    if (r.width < 200 || r.height < 150) { pendingFit = true; return; }
    pendingFit = false;
    const b = contentBounds();
    const k = Math.min(1, (r.width - 160) / b.w, (r.height - 200) / b.h);
    view.k = Math.max(0.2, k);
    view.x = r.width / 2 - (b.x + b.w / 2) * view.k;
    view.y = r.height / 2 - (b.y + b.h / 2) * view.k;
    applyView();
  }

  function zoomAt(factor, cx, cy) {
    const r = stageRect();
    const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2;
    const w = toWorld(px, py);
    view.k = Math.min(4, Math.max(0.1, view.k * factor));
    view.x = px - r.left - w.x * view.k;
    view.y = py - r.top - w.y * view.k;
    applyView();
  }

  const zoomTo = (k) => zoomAt(k / view.k);

  function ensureVisibleRect(b) {
    if (!b) return;
    const r = stageRect(), m = 80;
    const sx = b.x * view.k + view.x, sy = b.y * view.k + view.y, sw = b.w * view.k, sh = b.h * view.k;
    if (sx < m) view.x += m - sx; else if (sx + sw > r.width - m) view.x -= sx + sw - (r.width - m);
    if (sy < m) view.y += m - sy; else if (sy + sh > r.height - m) view.y -= sy + sh - (r.height - m);
    applyView();
  }

  function selectNode(id, scroll = true) {
    if (editing && !(editing.kind === 'node' && editing.id === id)) commitEdit();
    clearMulti();
    selectedId = id;
    selItem = null;
    closePopover();
    render();
    if (id && scroll) ensureVisibleRect(layout.boxes[id]);
  }

  function selectItem(id) {
    if (editing && !(editing.kind === 'item' && editing.id === id)) commitEdit();
    if (selItem !== id) selCell = null;
    clearMulti();
    selItem = id;
    selectedId = null;
    closePopover();
    render();
  }

  function clearSelection() {
    if (editing) commitEdit();
    clearMulti();
    selectedId = null;
    selItem = null;
    selCell = null;
    closePopover();
    render();
  }

  // ---------- Selección de varios elementos ----------

  const multiCount = () => multi.size + multiRoots.size + multiNodes.size;
  function clearMulti() { multi.clear(); multiRoots.clear(); multiNodes.clear(); }
  // ¿Forma parte de la selección? (también mientras se arrastra el recuadro, para verlo en vivo)
  function inSel(id) {
    const r = tokRoot(id), n = tokNode(id);
    const h = drag && drag.kind === 'marquee' && drag.hits;
    if (n) return h ? h.nodes.has(n) || h.roots.has(rootOf(n)) : multiNodes.has(n) || multiRoots.has(rootOf(n));
    if (h) return r ? h.roots.has(r) : h.set.has(id);
    return r ? multiRoots.has(r) : multi.has(id);
  }

  function setMulti(ids, roots = [], nodes = []) {
    if (editing) commitEdit();
    const list = [...new Set(ids)].filter((id) => doc.items[id] && !doc.items[id].locked);
    const rs = Array.isArray(roots) ? [...new Set(roots)].filter((r) => isRoot(r)) : [];
    const ns = [...new Set(nodes)].filter((n) => doc.nodes[n] && !isRoot(n) && !rs.includes(rootOf(n)));
    clearMulti();
    selInks.clear();
    selCell = null;
    closePopover();
    if (list.length + rs.length + ns.length === 1) return rs.length ? selectNode(rs[0], false) : ns.length ? selectNode(ns[0], false) : selectItem(list[0]);
    for (const id of list) multi.add(id);
    for (const r of rs) multiRoots.add(r);
    for (const n of ns) multiNodes.add(n);
    selItem = null;
    selectedId = null;
    render();
  }

  // Lo seleccionado ahora, sea uno o varios: { ids, map }.
  function currentSel() {
    if (multiCount()) return { ids: [...multi], roots: [...multiRoots], nodes: [...multiNodes] };
    if (selItem) return { ids: [selItem], roots: [], nodes: [] };
    if (selectedId) return isRoot(selectedId) ? { ids: [], roots: [selectedId], nodes: [] } : { ids: [], roots: [], nodes: [selectedId] };
    return { ids: [], roots: [], nodes: [] };
  }

  function toggleInSelection(gid) {
    const r = tokRoot(gid), n = tokNode(gid);
    if (!r && !n && doc.items[gid]?.locked) return;
    const cur = currentSel();
    const ids = new Set(cur.ids), roots = new Set(cur.roots), nodes = new Set(cur.nodes);
    if (r) { if (roots.has(r)) roots.delete(r); else roots.add(r); }
    else if (n) { if (nodes.has(n)) nodes.delete(n); else nodes.add(n); }
    else if (ids.has(gid)) ids.delete(gid); else ids.add(gid);
    if (!ids.size && !roots.size && !nodes.size) return clearSelection();
    setMulti([...ids], [...roots], [...nodes]);
  }

  const rectsTouch = (a, b) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
  const pointIn = ([x, y], r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  // ¿Toca el segmento p→q el rectángulo? (recorte de Liang-Barsky)
  function segTouches(p, q, r) {
    if (pointIn(p, r) || pointIn(q, r)) return true;
    let t0 = 0, t1 = 1;
    const dx = q[0] - p[0], dy = q[1] - p[1];
    for (const [pp, qq] of [[-dx, p[0] - r.x], [dx, r.x + r.w - p[0]], [-dy, p[1] - r.y], [dy, r.y + r.h - p[1]]]) {
      if (pp === 0) { if (qq < 0) return false; continue; }
      const t = qq / pp;
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 <= t1;
  }
  const polyTouches = (pts, r) => pts.some((p, i) => (i ? segTouches(pts[i - 1], p, r) : pointIn(p, r)));

  // Lo que toca el recuadro de selección: objetos (las secciones, solo si quedan dentro del todo),
  // conectores y trazos que lo cruzan, y el mapa mental si toca alguno de sus nodos. Nunca lo bloqueado.
  function marqueeHits(m) {
    const set = new Set();
    for (const it of Object.values(doc.items)) {
      if (it.locked) continue;
      if (it.type === 'conn') { const g = connGeom(it); if (g && polyTouches(g.samples, m)) set.add(it.id); continue; }
      if (it.type === 'ink') { if (polyTouches(inkWorldPts(it), m)) set.add(it.id); continue; }
      const r = itemRect(it.id);
      if (!r) continue;
      if (it.type === 'section' ? insideRect(r, m) : rectsTouch(r, m)) set.add(it.id);
    }
    const roots = new Set(), nodes = new Set();
    for (const b of Object.values(layout.boxes)) {
      if (!b.visible || !rectsTouch(b, m)) continue;
      if (b.level === 0) roots.add(b.root); else nodes.add(b.id);
    }
    for (const n of [...nodes]) if (roots.has(layout.boxes[n].root)) nodes.delete(n);
    return { set, roots, nodes };
  }

  function elemRect(id) {
    const r = tokRoot(id), n = tokNode(id);
    if (r) return layout.roots[r] ? layout.roots[r].bounds : null;
    if (n) return layout.boxes[n] && layout.boxes[n].visible ? layout.boxes[n] : null;
    const it = doc.items[id];
    if (!it) return null;
    return it.type === 'conn' ? connBounds(it) : itemRect(id);
  }

  function unionRect(rects) {
    const rs = rects.filter(Boolean);
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  }

  function multiBounds() {
    const ids = drag && drag.kind === 'marquee' && drag.hits ? [...drag.hits.set] : [...multi];
    const h = drag && drag.kind === 'marquee' && drag.hits;
    const roots = h ? [...h.roots] : [...multiRoots];
    const nodes = h ? [...h.nodes] : [...multiNodes];
    return unionRect([...ids.map(elemRect), ...roots.map((r) => layout.roots[r] && layout.roots[r].bounds), ...nodes.map((n) => elemRect(nodeTok(n)))]);
  }

  // Desplazar lo seleccionado. Los objetos de las secciones elegidas van con ellas; los conectores siguen a
  // sus objetos solos, pero sus extremos libres y sus tramos retocados se mueven si el conector va en la selección
  // o si sus dos extremos se mueven.
  function moveSet(sel) {
    const ids = new Set();
    const roots = new Set(sel.roots || []);
    for (const id of sel.ids) {
      const it = doc.items[id];
      if (!it || it.locked || it.type === 'conn') continue;
      ids.add(id);
      if (it.type === 'section') { const c = sectionContents(id); for (const x of c.ids) if (!doc.items[x].locked && doc.items[x].type !== 'conn') ids.add(x); for (const r of c.roots) roots.add(r); }
    }
    const moves = (ref) => !ref || ids.has(ref) || (ref.startsWith('node:') && roots.has(rootOf(ref.slice(5))));
    const conns = [];
    for (const c of Object.values(doc.items)) {
      if (c.type !== 'conn' || c.locked) continue;
      const chosen = sel.ids.includes(c.id);
      if (!chosen && !(c.from.ref && c.to.ref && moves(c.from.ref) && moves(c.to.ref))) continue;
      if (!chosen && !Array.isArray(c.chans)) continue;
      conns.push([c.id, { ...c.from }, { ...c.to }, Array.isArray(c.chans) ? c.chans.map((x) => ({ ...x })) : null]);
    }
    return { items: [...ids].map((id) => [id, doc.items[id].x, doc.items[id].y]), conns, maps: [...roots].map((r) => [r, { ...mapSettings(doc, r).origin }]) };
  }

  function shiftSel(ms, dx, dy) {
    for (const [id, x, y] of ms.items) { doc.items[id].x = x + dx; doc.items[id].y = y + dy; }
    for (const [id, from, to, chans] of ms.conns) {
      const c = doc.items[id];
      c.from = from.ref ? from : { x: from.x + dx, y: from.y + dy };
      c.to = to.ref ? to : { x: to.x + dx, y: to.y + dy };
      if (chans) c.chans = chans.map((ch) => ({ ...ch, v: ch.v + (ch.axis === 'x' ? dx : dy) }));
    }
    for (const [r, o] of ms.maps || []) mapSettings(doc, r).origin = { x: o.x + dx, y: o.y + dy };
  }

  function nudgeMulti(dx, dy) {
    const ms = moveSet(currentSel());
    mutate(() => shiftSel(ms, dx, dy));
  }

  function deleteMulti() {
    const ids = [...multi].filter((id) => doc.items[id] && !doc.items[id].locked);
    if (!ids.length && !multiNodes.size && ![...multiRoots].some((r) => r !== doc.rootId)) return;
    mutate(() => {
      for (const id of ids) if (doc.items[id].type === 'table') detachCharts(id);
      detachConns(new Set(ids));
      for (const id of ids) delete doc.items[id];
      for (const r of [...multiRoots, ...multiNodes]) {
        if (r === doc.rootId || !doc.nodes[r]) continue;
        const nids = subtreeIds(r);
        detachConns(new Set(nids.map((x) => `node:${x}`)));
        for (const n of nids) delete doc.nodes[n];
      }
    });
    clearSelection();
  }

  // Copias de varios objetos a la vez: los conectores y gráficos entre ellos apuntan a las copias.
  function cloneItems(list, dx, dy) {
    const idMap = new Map(list.map((it) => [it.id, uid()]));
    let z = topZ();
    const out = [];
    for (const src of list) {
      const it = JSON.parse(JSON.stringify(src));
      it.id = idMap.get(src.id);
      if (it.type === 'conn') {
        for (const e of [it.from, it.to]) { if (e.ref && idMap.has(e.ref)) e.ref = idMap.get(e.ref); else if (!e.ref) { e.x += dx; e.y += dy; } }
        if (Array.isArray(it.chans)) it.chans = it.chans.map((ch) => ({ ...ch, v: ch.v + (ch.axis === 'x' ? dx : dy) }));
      } else {
        it.x += dx;
        it.y += dy;
        if (it.type !== 'section') it.z = z++;
      }
      if (it.type === 'chart' && it.tableId && idMap.has(it.tableId)) it.tableId = idMap.get(it.tableId);
      delete it.locked;
      doc.items[it.id] = it;
      out.push(it.id);
    }
    return out;
  }

  function duplicateMulti() {
    const list = [...multi].map((id) => doc.items[id]).filter(Boolean);
    const ids = mutate(() => cloneItems(list, 24, 24));
    setMulti(ids, false);
  }

  function lockSel(lock) {
    const ids = selItem ? [selItem] : [...multi];
    mutate(() => { for (const id of ids) if (doc.items[id]) { if (lock) doc.items[id].locked = true; else delete doc.items[id].locked; } });
    if (lock && multiCount()) return clearSelection();
    render();
  }

  // Alinear y distribuir (el mapa mental cuenta como un bloque).
  function alignMulti(how) {
    const els = [...multi].filter((id) => doc.items[id].type !== 'conn').map((id) => [id, elemRect(id)]);
    for (const r of multiRoots) if (layout.roots[r]) els.push([mapTok(r), layout.roots[r].bounds]);
    if (els.length < 2) return;
    const box = unionRect(els.map((e) => e[1]));
    const shift = (id, dx, dy) => {
      if (!dx && !dy) return;
      const r = tokRoot(id);
      const ms = moveSet({ ids: r ? [] : [id], roots: r ? [r] : [] });
      shiftSel(ms, dx, dy);
    };
    mutate(() => {
      if (how === 'dist-h' || how === 'dist-v') {
        const h = how === 'dist-h';
        const sorted = els.sort((a, b) => (h ? a[1].x + a[1].w / 2 - (b[1].x + b[1].w / 2) : a[1].y + a[1].h / 2 - (b[1].y + b[1].h / 2)));
        const total = sorted.reduce((sum, [, r]) => sum + (h ? r.w : r.h), 0);
        const gap = ((h ? box.w : box.h) - total) / (sorted.length - 1);
        let pos = h ? box.x : box.y;
        for (const [id, r] of sorted) {
          shift(id, h ? Math.round(pos - r.x) : 0, h ? 0 : Math.round(pos - r.y));
          pos += (h ? r.w : r.h) + gap;
        }
        return;
      }
      for (const [id, r] of els) {
        const dx = { left: box.x - r.x, center: box.x + box.w / 2 - (r.x + r.w / 2), right: box.x + box.w - (r.x + r.w) }[how];
        const dy = { top: box.y - r.y, middle: box.y + box.h / 2 - (r.y + r.h / 2), bottom: box.y + box.h - (r.y + r.h) }[how];
        shift(id, Math.round(dx || 0), Math.round(dy || 0));
      }
    });
  }


  // Objetos que se pueden organizar (no conectores, trazos ni secciones).
  const arrangeable = () => [...multi].filter((id) => !['conn', 'section', 'ink'].includes(doc.items[id].type));
  function linksAmong(ids) {
    const s = new Set(ids);
    return Object.values(doc.items).filter((c) => c.type === 'conn' && s.has(c.from.ref) && s.has(c.to.ref) && c.from.ref !== c.to.ref);
  }

  // Organizar en cuadrícula, como árbol (de arriba abajo) o como mapa mental (de izquierda a derecha).
  // En árbol y mapa, las flechas que forman el árbol pasan a salir por abajo o por la derecha.
  function arrangeMulti(kind) {
    const ids = arrangeable();
    if (ids.length < 2) return;
    const rects = ids.map((id) => ({ id, ...itemRect(id) }));
    const links = linksAmong(ids);
    let pos, tree = null;
    if (kind === 'grid') pos = Arrange.grid(rects);
    else ({ pos, tree } = Arrange.tree(rects, links.map((c) => [c.from.ref, c.to.ref]), kind === 'tree' ? 'down' : 'right'));
    const moved = new Set(ids);
    mutate(() => {
      for (const id of ids) if (pos[id]) { doc.items[id].x = pos[id].x; doc.items[id].y = pos[id].y; }
      for (const c of Object.values(doc.items)) {
        if (c.type !== 'conn' || !(moved.has(c.from.ref) || moved.has(c.to.ref))) continue;
        delete c.chans;
        c.mid = null;
        if (tree && tree.has(`${c.from.ref}>${c.to.ref}`)) { c.from.side = kind === 'tree' ? 'bottom' : 'right'; c.to.side = kind === 'tree' ? 'top' : 'left'; }
        // En cuadrícula (o uniones que no forman el árbol) cada flecha vuelve a elegir sus lados una vez.
        else if (!tree || links.includes(c)) { if (c.from.ref) c.from.side = 'auto'; if (c.to.ref) c.to.side = 'auto'; }
      }
    });
  }

  // Escalar lo seleccionado desde una esquina del marco (la contraria queda fija). Se guarda el estado del
  // principio y en cada movimiento se recalcula desde él, así no se acumulan redondeos.
  function scaleOrig() {
    const items = new Map();
    const ids = new Set(multi);
    for (const id of multi) items.set(id, JSON.parse(JSON.stringify(doc.items[id])));
    for (const c of Object.values(doc.items)) {
      if (c.type === 'conn' && !items.has(c.id) && Array.isArray(c.chans) && ids.has(c.from.ref) && ids.has(c.to.ref)) items.set(c.id, JSON.parse(JSON.stringify(c)));
    }
    const maps = [...multiRoots].filter((r) => layout.roots[r]).map((r) => {
      const b = layout.roots[r].bounds;
      return [r, { ...mapSettings(doc, r).origin }, [b.x + b.w / 2, b.y + b.h / 2]];
    });
    return { items, maps };
  }

  function applyScale(d, f) {
    const { ax, ay } = d;
    const sx = (v) => Math.round(ax + (v - ax) * f), sy = (v) => Math.round(ay + (v - ay) * f);
    const sz = (v, min) => Math.max(min, Math.round(v * f));
    for (const [id, o] of d.orig.items) {
      const it = doc.items[id];
      if (!it) continue;
      if (o.type === 'conn') {
        if (!o.from.ref) it.from = { x: sx(o.from.x), y: sy(o.from.y) };
        if (!o.to.ref) it.to = { x: sx(o.to.x), y: sy(o.to.y) };
        if (Array.isArray(o.chans)) it.chans = o.chans.map((ch) => ({ ...ch, v: ch.axis === 'x' ? sx(ch.v) : sy(ch.v) }));
        continue;
      }
      it.x = sx(o.x);
      it.y = sy(o.y);
      if (['note', 'shape', 'section', 'chart', 'video'].includes(o.type)) { it.w = sz(o.w, 24); it.h = sz(o.h, 24); delete it.baseH; }
      else if (o.type === 'image') it.w = sz(o.w, 24);
      else if (o.type === 'sticker') it.size = sz(o.size, 12);
      else if (o.type === 'text' && o.w) it.w = sz(o.w, 24);
      else if (o.type === 'table') it.cols = o.cols.map((c) => sz(c, 40));
      else if (o.type === 'ink') it.pts = o.pts.map(([x, y]) => [Math.round(x * f * 10) / 10, Math.round(y * f * 10) / 10]);
    }
    for (const [r, o, [cx, cy]] of d.orig.maps) mapSettings(doc, r).origin = { x: Math.round(o.x + sx(cx) - cx), y: Math.round(o.y + sy(cy) - cy) };
  }

  // Ajustar a la cuadrícula: la esquina de cada objeto (y el mapa) va al punto del fondo más cercano.
  function snapToGrid() {
    const sel = currentSel();
    const snap = (v) => Math.round(v / GRID) * GRID;
    mutate(() => {
      for (const id of sel.ids) {
        const it = doc.items[id];
        if (!it || it.locked || it.type === 'conn') continue;
        shiftSel(moveSet({ ids: [id], roots: [] }), snap(it.x) - it.x, snap(it.y) - it.y);
      }
      for (const r of sel.roots) { const s = mapSettings(doc, r); s.origin = { x: snap(s.origin.x), y: snap(s.origin.y) }; }
    });
  }

  // Copiar y pegar estilo (entre objetos del mismo tipo), y guardarlo como el de los objetos nuevos.
  const STYLE_KEYS = { shape: ['color', 'style'], note: ['color'], text: ['size', 'color'], conn: ['color', 'style', 'startCap', 'endCap', 'route'],
    section: ['color', 'fill'], table: ['color', 'header', 'striped'], ink: ['color', 'width'], chart: ['kind', 'showValues'] };
  let styleClip = null;
  function copyStyle() {
    const it = selItem && doc.items[selItem];
    if (!it || !STYLE_KEYS[it.type]) return;
    styleClip = { type: it.type, props: JSON.parse(JSON.stringify(Object.fromEntries(STYLE_KEYS[it.type].map((k) => [k, it[k] ?? null])))) };
    toast('Estilo copiado');
  }
  const styleTargets = () => (styleClip ? (selItem ? [selItem] : [...multi]).filter((id) => doc.items[id] && doc.items[id].type === styleClip.type && !doc.items[id].locked) : []);
  function pasteStyle() {
    const ids = styleTargets();
    if (!ids.length) return;
    mutate(() => { for (const id of ids) Object.assign(doc.items[id], JSON.parse(JSON.stringify(styleClip.props))); });
  }
  function saveDefaultStyle() {
    const it = selItem && doc.items[selItem];
    if (!it) return;
    if (it.type === 'shape') pref(`mindmap:shape:${it.shape}`, JSON.stringify({ color: it.color, style: it.style }));
    else if (it.type === 'note') { noteColor = it.color; pref('mindmap:noteColor', it.color); }
    else if (it.type === 'text') pref('mindmap:text', JSON.stringify({ size: it.size, color: it.color }));
    else if (it.type === 'conn') pref('mindmap:conn', JSON.stringify({ color: it.color, style: it.style, startCap: it.startCap, endCap: it.endCap, route: it.route }));
    else return;
    toast('Guardado como estilo por defecto');
  }

  // Enlace a una posición del tablero: al abrirlo se va a ese mapa, centrado en ese punto y con ese zoom.
  function copyLink() {
    const b = multiCount() > 1 ? multiBounds() : selItem ? elemRect(selItem) : selectedId ? layout.boxes[selectedId] : null;
    const c = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : ctxPoint || viewCenter();
    const url = `${location.origin}${location.pathname}#m=${encodeURIComponent(map.id)}&x=${Math.round(c.x)}&y=${Math.round(c.y)}&z=${Math.round(view.k * 100) / 100}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Enlace copiado'), () => toast(url));
    else toast(url);
  }

  async function openFromHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const id = h.get('m');
    if (!id || !(await Store.get(id))) return false;
    if (!map || map.id !== id) await openMap(id);
    const x = Number(h.get('x')), y = Number(h.get('y')), z = Number(h.get('z')) || 1;
    if (h.has('x') && Number.isFinite(x) && Number.isFinite(y)) {
      const r = stageRect();
      view.k = Math.min(4, Math.max(0.1, z));
      view.x = r.width / 2 - x * view.k;
      view.y = r.height / 2 - y * view.k;
      pendingFit = false;
      applyView();
    }
    window.history.replaceState(null, '', location.pathname + location.search); // `history` aquí es el de deshacer
    return true;
  }

  let toastTimer = null;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); stage.appendChild(t); }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  const bottomZ = () => Object.values(doc.items).filter((i) => i.type !== 'section' && i.type !== 'conn').reduce((m, i) => Math.min(m, i.z || 0), 0) - 1;

  // ---------- Guías de alineación al arrastrar ----------
  // Los bordes y el centro de lo que se mueve se ajustan a los de lo que hay cerca (objetos y nodos de los mapas)
  // si quedan a menos de 6 px en pantalla, y se dibuja la guía. Con Alt pulsado no se ajusta.

  const SNAP_PX = 6;
  const GUIDE_COLOR = '#fb923c';

  function snapTargets(exItems, exRoots) {
    const out = [];
    for (const it of Object.values(doc.items)) {
      if (exItems.has(it.id) || it.type === 'conn' || it.type === 'ink') continue;
      const r = itemRect(it.id);
      if (r) out.push(r);
    }
    for (const b of Object.values(layout.boxes)) if (b.visible && !exRoots.has(b.root)) out.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    // Solo cuenta lo que está cerca del área visible (con margen), para que arrastrar siga siendo fluido.
    const r = stageRect(), m = 400 / view.k;
    const vx = -view.x / view.k - m, vy = -view.y / view.k - m, vw = r.width / view.k + 2 * m, vh = r.height / view.k + 2 * m;
    return out.filter((t) => t.x < vx + vw && t.x + t.w > vx && t.y < vy + vh && t.y + t.h > vy);
  }

  const edges = (x, w) => [x, x + w / 2, x + w];

  function snapDelta(r0, dx, dy, targets, off) {
    if (off || !r0) return { dx, dy, guides: [] };
    const thr = SNAP_PX / view.k;
    let bx = null, by = null;
    const xs = edges(r0.x + dx, r0.w), ys = edges(r0.y + dy, r0.h);
    for (const t of targets) {
      for (const p of xs) for (const q of edges(t.x, t.w)) { const d = q - p; if (Math.abs(d) <= thr && (!bx || Math.abs(d) < Math.abs(bx))) bx = d; }
      for (const p of ys) for (const q of edges(t.y, t.h)) { const d = q - p; if (Math.abs(d) <= thr && (!by || Math.abs(d) < Math.abs(by))) by = d; }
    }
    const ndx = dx + (bx || 0), ndy = dy + (by || 0);
    const fr = { x: r0.x + ndx, y: r0.y + ndy, w: r0.w, h: r0.h };
    // Una guía por cada línea en la que coinciden, del extremo de lo que se mueve al del objeto con el que alinea.
    const guides = [];
    const add = (axis, v, a1, b1) => {
      const g = guides.find((x) => x.axis === axis && Math.abs(x.v - v) < 0.5);
      if (g) { g.a = Math.min(g.a, a1); g.b = Math.max(g.b, b1); } else guides.push({ axis, v, a: a1, b: b1 });
    };
    for (const t of targets) {
      if (bx != null) for (const p of edges(fr.x, fr.w)) for (const q of edges(t.x, t.w)) if (Math.abs(p - q) < 0.5) add('x', q, Math.min(fr.y, t.y), Math.max(fr.y + fr.h, t.y + t.h));
      if (by != null) for (const p of edges(fr.y, fr.h)) for (const q of edges(t.y, t.h)) if (Math.abs(p - q) < 0.5) add('y', q, Math.min(fr.x, t.x), Math.max(fr.x + fr.w, t.x + t.w));
    }
    return { dx: ndx, dy: ndy, guides };
  }

  function guideLines() {
    if (!drag || !drag.guides || !drag.guides.length) return [];
    const k = view.k, ext = 12 / k;
    return drag.guides.map((g) => (g.axis === 'x'
      ? `<line x1="${g.v}" y1="${g.a - ext}" x2="${g.v}" y2="${g.b + ext}" stroke="${GUIDE_COLOR}" stroke-width="${0.8 / k}" stroke-opacity="0.9" shape-rendering="crispEdges"/>`
      : `<line x1="${g.a - ext}" y1="${g.v}" x2="${g.b + ext}" y2="${g.v}" stroke="${GUIDE_COLOR}" stroke-width="${0.8 / k}" stroke-opacity="0.9" shape-rendering="crispEdges"/>`));
  }

  const TYPE_NAMES = { note: 'Notas', text: 'Textos', sticker: 'Stickers', image: 'Imágenes', video: 'Vídeos', shape: 'Formas', section: 'Secciones',
    table: 'Tablas', chart: 'Gráficos', conn: 'Conectores', ink: 'Trazos', [MAP]: 'Mapas mentales', [NODE]: 'Nodos' };

  function multiBar() {
    const n = multiCount();
    const parts = [btn('menu-multi-filter', `${UI.filter}<b class="cb-count">${n}</b>`, 'Filtrar la selección', { menu: true }), sep];
    const solid = [...multi].filter((id) => doc.items[id].type !== 'conn').length + multiRoots.size;
    const movable = arrangeable();
    if (movable.length >= 2) {
      parts.push(btn('multi-arrange', UI.arrangeGrid, 'Organizar en cuadrícula', { arg: 'grid' }));
      if (linksAmong(movable).length) parts.push(`<span class="cb-group">${btn('multi-arrange', UI.arrangeTree, 'Organizar como árbol', { arg: 'tree' })}${btn('multi-arrange', UI.arrangeMind, 'Organizar como mapa mental', { arg: 'mind' })}</span>`);
      parts.push(sep);
    }
    if (solid >= 2) {
      parts.push(`<span class="cb-group">${btn('multi-align', UI.alignLeft, 'Alinear a la izquierda', { arg: 'left' })}${btn('multi-align', UI.alignCenter, 'Centrar en horizontal', { arg: 'center' })}${btn('multi-align', UI.alignRight, 'Alinear a la derecha', { arg: 'right' })}</span>`,
        `<span class="cb-group">${btn('multi-align', UI.alignTop, 'Alinear arriba', { arg: 'top' })}${btn('multi-align', UI.alignMiddle, 'Centrar en vertical', { arg: 'middle' })}${btn('multi-align', UI.alignBottom, 'Alinear abajo', { arg: 'bottom' })}</span>`);
      if (solid >= 3) parts.push(`<span class="cb-group">${btn('multi-align', UI.distH, 'Repartir en horizontal', { arg: 'dist-h' })}${btn('multi-align', UI.distV, 'Repartir en vertical', { arg: 'dist-v' })}</span>`);
      parts.push(sep);
    }
    if (multi.size) parts.push(btn('multi-dup', UI.duplicate, 'Duplicar · Ctrl D'), btn('multi-lock', UI.lock, 'Bloquear · Shift L'));
    if (multi.size || multiNodes.size || [...multiRoots].some((r) => r !== doc.rootId)) parts.push(btn('multi-del', UI.trash, 'Borrar · Supr'));
    parts.push(btn('menu-multi-more', UI.more, 'Más'));
    return parts.join('');
  }

  // ---------- Objetos libres: notas, texto, stickers, imágenes ----------

  function itemRect(id) {
    const it = doc.items[id], rec = itemEls.get(id);
    if (!it || !rec) return null;
    return { x: it.x, y: it.y, w: rec.el.offsetWidth, h: rec.el.offsetHeight };
  }

  function renderItems() {
    const items = doc.items || {};
    for (const [id, rec] of itemEls) if (!items[id]) { rec.el.remove(); itemEls.delete(id); }
    const sorted = Object.values(items).sort((a, b) => (a.z || 0) - (b.z || 0));
    const lastIn = new Map();
    for (const it of sorted) {
      if (it.type === 'section') { renderSection(it); continue; }
      if (it.type === 'conn') continue; // se dibujan en su propia capa SVG
      const layer = it.back ? backLayer : frontLayer;
      let rec = itemEls.get(it.id);
      if (!rec || rec.type !== it.type) {
        if (rec) rec.el.remove();
        const el = document.createElement('div');
        el.dataset.item = it.id;
        if (it.type === 'note' || it.type === 'text') el.innerHTML = '<div class="mm-text"></div><div class="rz"></div>';
        else if (it.type === 'shape') el.innerHTML = '<svg class="shape-svg"></svg><div class="shape-label"><div class="mm-text"></div></div><div class="rz"></div>';
        else if (it.type === 'table') el.innerHTML = '<div class="tbl-host"></div>';
        else if (it.type === 'chart') el.innerHTML = '<div class="chart-host"></div><div class="rz"></div>';
        else if (it.type === 'ink') el.innerHTML = '<div class="ink-host"></div><div class="rz"></div>';
        else if (it.type === 'image') el.innerHTML = '<img alt="" draggable="false"><div class="rz"></div>';
        else if (it.type === 'video') el.innerHTML = '<div class="video-host"></div><div class="rz"></div>';
        else el.innerHTML = '<span class="emoji"></span><div class="rz"></div>';
        rec = { el, type: it.type, text: el.querySelector('.mm-text'), sig: '' };
        itemEls.set(it.id, rec);
      }
      // Orden por z sin mover elementos que ya están en su sitio (moverlos quitaría el foco al editar).
      const prev = lastIn.get(layer);
      const want = prev ? prev.nextSibling : layer.firstChild;
      if (rec.el !== want) layer.insertBefore(rec.el, want);
      lastIn.set(layer, rec.el);
      const isEditing = editing && editing.kind === 'item' && editing.id === it.id;
      const cls = ['mm-item', it.type === 'text' ? 'textbox' : it.type];
      if (it.id === selItem) cls.push('selected');
      if (inSel(it.id)) cls.push('in-sel');
      if (it.locked) cls.push('locked');
      if (it.id === hoverItem && it.id !== selItem && !inSel(it.id)) cls.push('hover');
      if (isEditing) cls.push('editing');
      rec.el.className = cls.join(' ');
      const s = rec.el.style;
      s.transform = `translate(${it.x}px, ${it.y}px)`;
      if (it.type === 'note') {
        s.width = `${it.w}px`;
        s.minHeight = `${it.h}px`;
        s.background = NOTE_COLORS[it.color] || it.color;
        s.color = THEME_COLORS[theme].noteInk(it.color);
      } else if (it.type === 'shape') {
        drawShape(rec, it);
      } else if (it.type === 'table') {
        drawTable(rec, it);
      } else if (it.type === 'chart') {
        drawChart(rec, it);
      } else if (it.type === 'ink') {
        drawInk(rec, it);
        if (selInks.has(it.id)) rec.el.classList.add('selected');
      } else if (it.type === 'text') {
        const [, fs, lh] = TEXT_SIZES.find((t) => t[0] === it.size) || TEXT_SIZES[1];
        s.fontSize = `${fs}px`;
        s.lineHeight = `${lh}px`;
        s.color = TEXT_COLORS[it.color] || it.color || TEXT_COLORS.white;
        s.width = it.w ? `${it.w}px` : 'max-content';
        s.maxWidth = it.w ? '' : '640px';
      } else if (it.type === 'sticker') {
        s.fontSize = `${it.size}px`;
        rec.el.querySelector('.emoji').textContent = it.emoji;
      } else if (it.type === 'image') {
        s.width = `${it.w}px`;
        const img = rec.el.querySelector('img');
        if (img.getAttribute('src') !== it.src) img.src = it.src;
      } else if (it.type === 'video') {
        s.width = `${it.w}px`;
        s.height = `${it.h}px`;
        drawVideo(rec, it);
      }
      if (rec.text) {
        const empty = it.lines.every((l) => !l);
        rec.text.className = `mm-text tag-${blockAt(it, 0)}${empty ? ' empty-item' : ''}`;
        rec.text.style.textAlign = it.align || '';
        rec.text.dataset.ph = it.type === 'note' ? 'Escribe una nota…' : it.type === 'text' ? 'Texto' : '';
        const sig = `${it.block}|${(it.blocks || []).join(',')}|${it.lines.join('\u0001')}|${it.checked.join(',')}`;
        if (!isEditing && sig !== rec.sig) { rec.text.innerHTML = contentHTML(it); rec.sig = sig; }
        if (it.type === 'shape') fitShapeText(rec, it);
      }
    }
    // Los conectores siguen a los objetos: se recalculan después de colocarlos.
    renderConnectors();
  }

  const isLight = (key) => ['white', 'yellow', 'silver'].includes(key);

  // Las formas crecen en alto con su texto para que nunca se salga, y vuelven a su tamaño si el texto se acorta
  // (`baseH` guarda el alto que tenían antes de crecer; cambiar el tamaño a mano lo fija de nuevo).
  function fitShapeText(rec, it) {
    if (!rec.text) return;
    const swap = (it.rot || 0) % 180 !== 0;
    const inset = Shapes.TEXT_INSET[it.shape] || [0.06, 0.06];
    const frac = Math.max(0.2, 1 - 2 * (swap ? inset[0] : inset[1]));
    const need = Math.ceil((rec.text.offsetHeight + 12) / frac);
    const want = Math.max(it.baseH ?? it.h, need);
    if (want === it.h) return;
    if (it.baseH == null) it.baseH = it.h;
    it.h = want;
    if (it.h === it.baseH) delete it.baseH;
    drawShape(rec, it);
  }

  function drawShape(rec, it) {
    const s = rec.el.style;
    s.width = `${it.w}px`;
    s.height = `${it.h}px`;
    const rot = it.rot || 0;
    const swap = rot % 180 !== 0;
    const pw = swap ? it.h : it.w, ph = swap ? it.w : it.h;
    const color = SHAPE_COLORS[it.color] || it.color;
    const sig = `${it.shape}|${it.w}|${it.h}|${it.color}|${it.style}|${rot}`;
    if (rec.shapeSig !== sig) {
      rec.shapeSig = sig;
      const p = Shapes.path(it.shape, pw, ph);
      const style = it.style || 'border';
      const fill = style === 'fill' ? color : style === 'none' ? 'transparent' : `color-mix(in srgb, ${color} 20%, ${SURFACE})`;
      const stroke = style === 'fill' ? 'none' : color;
      const dash = style === 'dashed' ? ' stroke-dasharray="7 6"' : '';
      const tr = rot ? ` transform="translate(${it.w / 2},${it.h / 2}) rotate(${rot}) translate(${-pw / 2},${-ph / 2})"` : '';
      const rim = style === 'fill' ? 'rgb(0 0 0 / 0.28)' : color;
      rec.el.querySelector('.shape-svg').innerHTML = `<g${tr}><path d="${p.body}" fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"${dash}/>` +
        (p.extra ? `<path d="${p.extra}" fill="none" stroke="${rim}" stroke-width="2.5"${dash}/>` : '') + '</g>';
      const inset = Shapes.TEXT_INSET[it.shape] || [0.06, 0.06];
      const [ix, iy, dy = 0] = swap ? [inset[1], inset[0], 0] : inset;
      const label = rec.el.querySelector('.shape-label');
      Object.assign(label.style, {
        left: `${it.w * ix}px`, width: `${it.w * (1 - 2 * ix)}px`,
        top: `${it.h * (iy + dy)}px`, height: `${it.h * (1 - 2 * iy)}px`,
        color: style === 'fill' ? (isLight(it.color) ? '#1d1d1f' : '#fff') : style === 'none' || theme === 'light' ? THEME_COLORS[theme].ink : '#fff',
      });
    }
  }

  function renderSection(it) {
    let rec = itemEls.get(it.id);
    if (!rec || rec.type !== 'section') {
      if (rec) rec.el.remove();
      const el = document.createElement('div');
      el.dataset.item = it.id;
      el.innerHTML = '<div class="sec-title"><span class="sec-name"></span></div>' +
        '<div class="sec-edge t"></div><div class="sec-edge b"></div><div class="sec-edge l"></div><div class="sec-edge r"></div><div class="rz"></div>';
      rec = { el, type: 'section', name: el.querySelector('.sec-name') };
      itemEls.set(it.id, rec);
    }
    if (rec.el.parentNode !== sectionsLayer) sectionsLayer.appendChild(rec.el);
    rec.el.className = `mm-section ${it.fill ? 'filled' : 'outline'}${it.id === selItem ? ' selected' : ''}${inSel(it.id) ? ' in-sel' : ''}${it.locked ? ' locked' : ''}`;
    const s = rec.el.style;
    s.transform = `translate(${it.x}px, ${it.y}px)`;
    s.width = `${it.w}px`;
    s.height = `${it.h}px`;
    s.setProperty('--sec', SECTION_COLORS[it.color] || it.color);
    if (rec.name.contentEditable !== 'true' && rec.name.textContent !== it.name) rec.name.textContent = it.name;
  }

  const insideRect = (r, s) => r.x >= s.x && r.y >= s.y && r.x + r.w <= s.x + s.w && r.y + r.h <= s.y + s.h;

  // Lo que hay dentro de una sección: objetos (también otras secciones) y, si cabe entero, el mapa.
  function sectionContents(id) {
    const s = itemRect(id);
    const ids = [];
    for (const other of Object.keys(doc.items)) {
      if (other === id) continue;
      const r = itemRect(other);
      if (r && insideRect(r, s)) ids.push(other);
    }
    return { ids, roots: Object.keys(layout.roots).filter((r) => insideRect(layout.roots[r].bounds, s)) };
  }

  function renameSection(id) {
    const rec = itemEls.get(id);
    if (!rec) return;
    const el = rec.name;
    const before = snapshot();
    el.contentEditable = 'true';
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      el.contentEditable = 'false';
      const v = el.textContent.trim();
      if (save && v) doc.items[id].name = v;
      el.textContent = doc.items[id].name;
      commit(before);
      render();
    };
    el.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    el.onblur = () => finish(true);
  }

  // Envuelve el objeto o el mapa seleccionado en una sección nueva.
  function wrapInSection(r = selItem ? itemRect(selItem) : (layout.roots[rootOf(selectedId || doc.rootId)] || layout).bounds) {
    if (!r) return;
    const pad = 48;
    const id = createItem('section', { x: r.x - pad, y: r.y - pad }, { center: false, w: r.w + pad * 2, h: r.h + pad * 2 });
    return id;
  }

  // ---------- Conectores ----------

  // Rectángulo de un extremo conectado: objeto libre o nodo del mapa ('node:<id>').
  // Si el nodo está plegado, se usa el antepasado visible más cercano.
  function refRect(ref) {
    if (!ref) return null;
    if (ref.startsWith('node:')) {
      let id = ref.slice(5);
      while (id && !(layout.boxes[id] && layout.boxes[id].visible)) id = doc.nodes[id] ? doc.nodes[id].parentId : null;
      const b = id && layout.boxes[id];
      return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
    }
    return itemRect(ref);
  }

  const connColor = (c) => SHAPE_COLORS[c.color] || c.color || CONN_COLOR;
  const connWidth = (c) => (c.style === 'thick' ? 4 : 2);
  const connOk = (c) => [c.from, c.to].every((e) => (e.ref ? !!refRect(e.ref) : e.x != null));
  const connGeom = (c) => (connOk(c) ? Conn.geometry(c, refRect) : null);

  function renderConnectors() {
    const out = [];
    let fixed = false;
    for (const c of Object.values(doc.items)) {
      if (c.type !== 'conn') continue;
      const g = connGeom(c);
      if (!g) continue;
      // El lado de cada extremo se decide una vez y queda fijo; luego solo se adapta el recorrido.
      for (const [e, end] of [[c.from, g.a], [c.to, g.b]]) if (e.ref && (!e.side || e.side === 'auto') && end.side) { e.side = end.side; fixed = true; }
      const color = connColor(c), w = connWidth(c);
      const dash = c.style === 'dashed' ? ' stroke-dasharray="7 6"' : '';
      out.push(`<g data-cid="${c.id}"><path d="${g.d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`,
        Conn.cap(c.startCap, g.a.p, g.startDir, color, w, SURFACE), Conn.cap(c.endCap, g.b.p, g.endDir, color, w, SURFACE),
        `<path class="conn-hit" data-conn="${c.id}" d="${g.d}" fill="none" stroke="transparent" stroke-width="16"/>`);
      if (c.label) {
        const [lx, ly] = Conn.pointAt(g.samples, c.labelT ?? 0.5);
        const tw = Math.max(16, c.label.length * 7.4 + 14);
        out.push(`<g class="conn-label" data-clabel="${c.id}"><rect x="${lx - tw / 2}" y="${ly - 12}" width="${tw}" height="24" rx="6" fill="${c.labelBg ? (theme === 'light' ? '#1f2733' : '#e9ecef') : SURFACE}"/>` +
          `<text x="${lx}" y="${ly + 4.5}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="13" font-weight="500" fill="${c.labelBg ? (theme === 'light' ? '#fff' : '#1d1d1f') : THEME_COLORS[theme].labelInk}">${esc(c.label)}</text></g>`);
      }
      out.push('</g>');
    }
    gConns.innerHTML = out.join('');
    if (fixed) saveSoon();
  }

  function createConn(from, to, extra = {}) {
    const id = uid();
    const def = JSON.parse(pref('mindmap:conn') || '{}');
    doc.items[id] = { id, type: 'conn', z: 0, from, to, route: def.route || 'elbow', color: def.color ?? null, style: def.style || 'solid',
      startCap: def.startCap || 'none', endCap: def.endCap || 'arrow', label: '', labelT: 0.5, mid: null, ...extra };
    return id;
  }

  // Objeto bajo un punto (para conectar): primero objetos de delante, luego nodos del mapa y por último secciones.
  function targetAt(p, exclude = null, margin = 4) {
    const inRect = (r) => r && p.x >= r.x - margin && p.x <= r.x + r.w + margin && p.y >= r.y - margin && p.y <= r.y + r.h + margin;
    const items = Object.values(doc.items).filter((i) => !['conn', 'ink', 'section'].includes(i.type) && i.id !== exclude)
      .sort((a, b) => (b.back ? 0 : 1) - (a.back ? 0 : 1) || (b.z || 0) - (a.z || 0));
    for (const it of items) { const r = itemRect(it.id); if (inRect(r)) return { ref: it.id, rect: r }; }
    for (const b of Object.values(layout.boxes)) {
      if (b.visible && `node:${b.id}` !== exclude && inRect(b)) return { ref: `node:${b.id}`, rect: { x: b.x, y: b.y, w: b.w, h: b.h } };
    }
    for (const it of Object.values(doc.items)) {
      if (it.type === 'section' && it.id !== exclude) { const r = itemRect(it.id); if (inRect(r)) return { ref: it.id, rect: r }; }
    }
    return null;
  }

  const endFor = (t, p) => (t ? { ref: t.ref, side: Conn.nearestSide(t.rect, [p.x, p.y]) } : { x: Math.round(p.x), y: Math.round(p.y) });
  const SNAP = 16; // px de pantalla alrededor de un objeto en los que un conector ya se engancha
  const DIR_SIDE = { right: 'right', left: 'left', up: 'top', down: 'bottom' };
  const OPPOSITE = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };

  // Al borrar objetos o nodos, sus conectores no desaparecen: el extremo se queda donde estaba.
  function detachConns(refs) {
    for (const c of Object.values(doc.items)) {
      if (c.type !== 'conn') continue;
      if (!refs.has(c.from.ref) && !refs.has(c.to.ref)) continue;
      const g = connGeom(c);
      if (!g) continue;
      if (refs.has(c.from.ref)) c.from = { x: Math.round(g.a.p[0]), y: Math.round(g.a.p[1]) };
      if (refs.has(c.to.ref)) c.to = { x: Math.round(g.b.p[0]), y: Math.round(g.b.p[1]) };
    }
  }

  // Añadir rápido desde una forma: otra igual al lado, ya conectada .
  function addShapeNext(dir) {
    const it = doc.items[selItem];
    const r = itemRect(selItem);
    if (!it || !r) return;
    if (editing) commitEdit();
    const before = snapshot();
    const gap = 110;
    const nx = { right: r.x + r.w + gap, left: r.x - gap - it.w, down: r.x, up: r.x }[dir];
    const ny = { right: r.y, left: r.y, down: r.y + r.h + gap, up: r.y - gap - it.h }[dir];
    const spot = freeSpot(nx, ny, it.w, it.h);
    const id = uid();
    doc.items[id] = { ...JSON.parse(JSON.stringify(it)), id, x: spot.x, y: spot.y, z: topZ(), lines: [''], block: 'p', checked: [] };
    // Sale del lado del punto pulsado y entra por el opuesto; si luego se mueven, se adapta el recorrido.
    createConn({ ref: it.id, side: DIR_SIDE[dir] }, { ref: id, side: OPPOSITE[DIR_SIDE[dir]] });
    selItem = id;
    render();
    startItemEdit(id, { before });
  }

  // ---------- Dibujo a mano ----------

  const INK_COLORS = { white: '#e9ecef', gray: '#9aa5b4', ...Object.fromEntries(L.PALETTE_ORDER.slice(0, 8).map((k) => [k, L.PALETTE[k]])) };
  const inkColor = (k) => INK_COLORS[k] || k;
  const inkWidth = (hl, thick) => (hl ? (thick ? 28 : 16) : thick ? 6 : 3);

  function drawInk(rec, it) {
    const sig = JSON.stringify([it.pts.length, it.pts[0], it.pts[it.pts.length - 1], it.color, it.width, it.hl, it.scale]);
    const xs = it.pts.map((p) => p[0]), ys = it.pts.map((p) => p[1]);
    const w = Math.max(...xs), h = Math.max(...ys);
    rec.el.style.width = `${Math.max(1, w)}px`;
    rec.el.style.height = `${Math.max(1, h)}px`;
    if (rec.sig === sig) return;
    rec.sig = sig;
    const pad = it.width + 6;
    const d = Ink.smoothPath(it.pts.map(([x, y]) => [x + pad, y + pad]));
    rec.el.querySelector('.ink-host').innerHTML = `<svg width="${w + pad * 2}" height="${h + pad * 2}" style="position:absolute;left:${-pad}px;top:${-pad}px">` +
      `<path d="${d}" fill="none" stroke="${inkColor(it.color)}" stroke-width="${it.width}" stroke-linecap="round" stroke-linejoin="round"${it.hl ? ' stroke-opacity="0.38"' : ''}/>` +
      `<path class="ink-hit" d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(14, it.width + 8)}"/></svg>`;
  }

  // Crea un trazo a partir de puntos en coordenadas del mundo.
  function addInk(worldPts, hl) {
    let pts = Ink.simplify(worldPts);
    if (inkPrefs.detect && !hl) {
      const shape = Ink.recognize(pts);
      if (shape) pts = shape.pts;
    }
    const b = Ink.bbox(pts);
    const before = snapshot();
    const id = uid();
    doc.items[id] = { id, type: 'ink', x: Math.round(b.x), y: Math.round(b.y), z: topZ(), pts: pts.map(([x, y]) => [Math.round((x - b.x) * 10) / 10, Math.round((y - b.y) * 10) / 10]),
      color: inkPrefs.color, width: inkWidth(hl, inkPrefs.thick), hl: !!hl };
    commit(before);
    renderItems();
  }

  const inkWorldPts = (it) => it.pts.map(([x, y]) => [x + it.x, y + it.y]);

  // Goma: borra los trazos que toca (radio constante en pantalla, también al alejar el zoom).
  function eraseAt(p) {
    const r = 10 / view.k;
    let hit = false;
    for (const it of Object.values(doc.items)) {
      if (it.type === 'ink' && Ink.hits(inkWorldPts(it), [p.x, p.y], r + it.width / 2)) { delete doc.items[it.id]; hit = true; }
    }
    if (hit) { drag.removed++; renderItems(); }
  }

  function selInkBounds() {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const id of selInks) { const r = itemRect(id); if (!r) continue; x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); }
    return x1 === Infinity ? null : { x: x1 - 8, y: y1 - 8, w: x2 - x1 + 16, h: y2 - y1 + 16 };
  }

  function setDrawTool(t) {
    inkPrefs.tool = t;
    saveInkPrefs();
    if (t !== 'lasso') selInks.clear();
    syncDrawbox();
    render();
  }

  function syncDrawbox() {
    const box = $('#drawbox');
    box.hidden = tool !== 'draw';
    $('#toolbox').hidden = tool === 'draw';
    box.querySelectorAll('[data-draw]').forEach((b) => {
      const k = b.dataset.draw;
      b.classList.toggle('on', k === inkPrefs.tool || (k === 'thick' && inkPrefs.thick) || (k === 'thin' && !inkPrefs.thick) || (k === 'detect' && inkPrefs.detect));
    });
    box.querySelector('.ink-dot').style.background = inkColor(inkPrefs.color);
    stage.classList.toggle('drawing', tool === 'draw' && inkPrefs.tool !== 'eraser');
    stage.classList.toggle('erasing', tool === 'draw' && inkPrefs.tool === 'eraser');
  }

  // ---------- Tablas ----------

  const cellKey = (r, c) => `td[data-r="${r}"][data-c="${c}"]`;

  function drawTable(rec, it) {
    const ed = editing && editing.kind === 'cell' && editing.id === it.id ? editing : null;
    const sel = it.id === selItem ? selCell : null;
    const sig = JSON.stringify([it.rows, it.cols, it.header, it.striped, it.color, sel, !!ed]);
    if (ed) {
      // Mientras se escribe en una celda no se reconstruye la tabla (perdería el cursor).
      rec.el.style.width = '';
      return;
    }
    if (rec.sig === sig) return;
    rec.sig = sig;
    const cls = ['mm-table', it.header !== false ? 'with-header' : '', it.striped ? 'striped' : ''].join(' ');
    const html = [`<table class="${cls}" style="--tc:${SECTION_COLORS[it.color] || it.color || SECTION_COLORS.gray};width:${it.cols.reduce((a, b) => a + b, 0)}px"><colgroup>`,
      ...it.cols.map((w) => `<col style="width:${w}px">`), '</colgroup><tbody>'];
    it.rows.forEach((row, r) => {
      html.push('<tr>');
      row.forEach((cell, c) => {
        const on = sel && sel.r === r && sel.c === c ? ' class="cell-sel"' : '';
        html.push(`<td data-r="${r}" data-c="${c}"${on}><div class="cell">${cell || ''}</div>${r === 0 ? `<div class="col-rz" data-col="${c}"></div>` : ''}</td>`);
      });
      html.push('</tr>');
    });
    html.push('</tbody></table>');
    rec.el.querySelector('.tbl-host').innerHTML = html.join('');
  }

  // Busca un hueco libre cerca de (x, y) para un rectángulo w × h: baja en pasos hasta no solapar nada.
  function freeSpot(x, y, w, h, ignore = null) {
    const rects = Object.keys(doc.items).filter((id) => id !== ignore && doc.items[id].type !== 'section').map(itemRect).filter(Boolean);
    rects.push(...Object.values(layout.roots).map((x) => x.bounds));
    const hits = (px, py) => rects.some((r) => px < r.x + r.w + 24 && px + w + 24 > r.x && py < r.y + r.h + 24 && py + h + 24 > r.y);
    for (let i = 0; i < 60; i++) {
      const py = y + i * 40;
      if (!hits(x, py)) return { x: Math.round(x), y: Math.round(py) };
    }
    const cb = contentBounds();
    return { x: Math.round(x), y: Math.round(cb.y + cb.h + 60) };
  }

  const colWidthFor = (rows, c) => Math.max(90, Math.min(260, Math.max(...rows.map((r) => Tables.strip(r[c] || '').length)) * 8 + 28));

  function createTableFromRows(rows, at, { escaped = false } = {}) {
    if (editing) commitEdit();
    const cells = rows.map((r) => r.map((v) => (escaped ? v : esc(v))));
    const before = snapshot();
    const id = uid();
    const cols = cells[0].map((_, c) => colWidthFor(cells, c));
    const w = cols.reduce((a, b) => a + b, 0), h = cells.length * 34;
    const spot = freeSpot(at.x - w / 2, at.y - h / 2, w, h);
    doc.items[id] = { id, type: 'table', x: spot.x, y: spot.y, z: topZ(), rows: cells, cols, header: true, striped: cells.length > 6, color: 'gray' };
    setTool('select');
    selItem = id;
    selectedId = null;
    selCell = null;
    commit(before);
    render();
    if (rows.length >= Tables.MAX_ROWS) toast(`La tabla se ha recortado a ${Tables.MAX_ROWS} filas`);
    return id;
  }

  function createTable(nr, nc, at) {
    if (editing) commitEdit();
    const before = snapshot();
    const id = uid();
    const rows = [[...Array(nc)].map((_, c) => `Columna ${c + 1}`), ...[...Array(nr - 1)].map(() => Array(nc).fill(''))];
    const spot = freeSpot(at.x - (nc * 140) / 2, at.y - (nr * 34) / 2, nc * 140, nr * 34);
    doc.items[id] = { id, type: 'table', x: spot.x, y: spot.y, z: topZ(), rows, cols: Array(nc).fill(140), header: true, striped: false, color: 'gray' };
    setTool('select');
    // Un único paso de deshacer: crear la tabla y escribir el primer encabezado.
    startCellEdit(id, 0, 0, { selectAll: true, before });
    return id;
  }

  async function importCSVFile(file, at) {
    try {
      const text = await file.text();
      const parsed = Tables.parse(text) || { rows: text.split(/\r?\n/).filter((l) => l.trim()).map((l) => [l]) };
      createTableFromRows(parsed.rows, at, parsed);
    } catch (err) {
      uiAlert(`No se pudo importar «${file.name}»: ${err.message}`);
    }
  }

  // Operaciones de filas y columnas sobre la tabla seleccionada (respecto a la celda activa).
  function tableOp(op, arg) {
    const it = doc.items[selItem];
    if (!it || it.type !== 'table') return;
    const nr = it.rows.length, nc = it.cols.length;
    const at = selCell || { r: nr - 1, c: nc - 1 };
    const emptyRow = () => Array(nc).fill('');
    mutate(() => {
      switch (op) {
        case 'row-above': it.rows.splice(at.r, 0, emptyRow()); break;
        case 'row-below': it.rows.splice(at.r + 1, 0, emptyRow()); selCell = { r: at.r + 1, c: at.c }; break;
        case 'row-end': it.rows.push(emptyRow()); selCell = { r: it.rows.length - 1, c: at.c }; break;
        case 'col-left': it.rows.forEach((r) => r.splice(at.c, 0, '')); it.cols.splice(at.c, 0, 140); break;
        case 'col-right': it.rows.forEach((r) => r.splice(at.c + 1, 0, '')); it.cols.splice(at.c + 1, 0, 140); selCell = { r: at.r, c: at.c + 1 }; break;
        case 'col-end': it.rows.forEach((r) => r.push('')); it.cols.push(140); selCell = { r: at.r, c: it.cols.length - 1 }; break;
        case 'row-del': if (nr > 1) { it.rows.splice(at.r, 1); selCell = { r: Math.min(at.r, nr - 2), c: at.c }; } break;
        case 'col-del': if (nc > 1) { it.rows.forEach((r) => r.splice(at.c, 1)); it.cols.splice(at.c, 1); selCell = { r: at.r, c: Math.min(at.c, nc - 2) }; } break;
        case 'row-up': if (at.r > 0) { [it.rows[at.r - 1], it.rows[at.r]] = [it.rows[at.r], it.rows[at.r - 1]]; selCell = { r: at.r - 1, c: at.c }; } break;
        case 'row-down': if (at.r < nr - 1) { [it.rows[at.r + 1], it.rows[at.r]] = [it.rows[at.r], it.rows[at.r + 1]]; selCell = { r: at.r + 1, c: at.c }; } break;
        case 'col-left-move': if (at.c > 0) { for (const r of it.rows) [r[at.c - 1], r[at.c]] = [r[at.c], r[at.c - 1]]; [it.cols[at.c - 1], it.cols[at.c]] = [it.cols[at.c], it.cols[at.c - 1]]; selCell = { r: at.r, c: at.c - 1 }; } break;
        case 'col-right-move': if (at.c < nc - 1) { for (const r of it.rows) [r[at.c + 1], r[at.c]] = [r[at.c], r[at.c + 1]]; [it.cols[at.c + 1], it.cols[at.c]] = [it.cols[at.c], it.cols[at.c + 1]]; selCell = { r: at.r, c: at.c + 1 }; } break;
        case 'sort': {
          // Ordena las filas de datos (sin el encabezado) por la columna activa: números como números.
          const head = it.header !== false ? it.rows.slice(0, 1) : [];
          const body = it.rows.slice(head.length);
          const key = (r) => { const t = Tables.strip(r[at.c] || ''); const n = Charts.parseNumber(t); return n != null ? n : t.toLowerCase(); };
          body.sort((a, b) => {
            const x = key(a), y = key(b);
            const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true });
            return arg === 'desc' ? -cmp : cmp;
          });
          it.rows = [...head, ...body];
          break;
        }
        case 'clear-cell': it.rows[at.r][at.c] = ''; break;
        default: break;
      }
    });
  }

  function exportCSV(id = selItem) {
    const it = doc.items[id];
    if (!it) return;
    const name = (titleOf(map) || 'tabla').replace(/[\\/:*?"<>|]+/g, '').slice(0, 50);
    download(`${name}.csv`, new Blob([Tables.toCSV(it.rows)], { type: 'text/csv;charset=utf-8' }));
  }

  function startCellEdit(id, r, c, { selectAll = false, replace = null, point = null, before = snapshot() } = {}) {
    if (doc.items[id]?.locked) return;
    if (editing) commitEdit();
    selItem = id;
    selectedId = null;
    selCell = { r, c };
    render();
    editing = { kind: 'cell', id, r, c, before };
    const td = itemEls.get(id).el.querySelector(cellKey(r, c));
    if (!td) { editing = null; return; }
    td.classList.add('cell-edit');
    const cellEl = td.querySelector('.cell');
    if (replace != null) cellEl.textContent = replace;
    focusEditable(cellEl, { point, selectAll: selectAll && replace == null, replace });
    updateContextbar();
  }

  // Mueve la celda activa (y crea fila al pasar del final, como en una hoja de cálculo).
  function moveCell(dr, dc, { edit = false, grow = false } = {}) {
    const it = doc.items[selItem];
    if (!it || !selCell) return;
    const nr = it.rows.length, nc = it.cols.length;
    let r = selCell.r + dr, c = selCell.c + dc;
    if (c >= nc) { c = 0; r++; }
    if (c < 0) { c = nc - 1; r--; }
    if (r < 0) r = 0;
    if (r >= nr) {
      if (!grow) r = nr - 1;
      else { const before = snapshot(); it.rows.push(Array(nc).fill('')); commit(before); }
    }
    selCell = { r, c };
    if (edit) startCellEdit(selItem, r, c, { selectAll: true }); else render();
  }

  // ---------- Gráficos ----------

  function chartDataFor(it) {
    const t = it.tableId && doc.items[it.tableId];
    if (t && t.type === 'table') return Tables.chartData(t, { labelCol: it.labelCol, seriesCols: it.seriesCols }, Charts.parseNumber);
    return it.cache || { labels: [], series: [], head: [], numericCols: [], seriesCols: [], labelCol: -1 };
  }

  function drawChart(rec, it) {
    const data = chartDataFor(it);
    const spec = { kind: it.kind, title: it.title, showValues: it.showValues };
    const sig = JSON.stringify([spec, data.labels, data.series, it.w, it.h]);
    rec.el.style.width = `${it.w}px`;
    rec.el.style.height = `${it.h}px`;
    if (rec.sig === sig) return;
    rec.sig = sig;
    rec.el.querySelector('.chart-host').innerHTML = Charts.render(spec, data, it.w, it.h);
  }

  function createChart(tableId, kind) {
    const t = doc.items[tableId];
    const r = itemRect(tableId);
    if (!t || !r) return;
    const data = Tables.chartData(t, {}, Charts.parseNumber);
    const title = data.series.length === 1 ? data.series[0].name : data.series.length ? `${data.series.map((s) => s.name).slice(0, 3).join(', ')}` : 'Gráfico';
    const before = snapshot();
    const id = uid();
    const spot = freeSpot(r.x + r.w + 60, r.y, 540, 360);
    doc.items[id] = { id, type: 'chart', tableId, kind, x: spot.x, y: spot.y, z: topZ(), w: 540, h: 360, title, labelCol: null, seriesCols: null, showValues: null };
    selItem = id;
    selCell = null;
    commit(before);
    render();
    ensureVisibleRect({ x: spot.x, y: spot.y, w: 540, h: 360 });
  }

  // Al borrar una tabla, sus gráficos guardan los últimos datos para no quedarse vacíos.
  function detachCharts(tableId) {
    for (const ch of Object.values(doc.items)) {
      if (ch.type === 'chart' && ch.tableId === tableId) {
        const d = chartDataFor(ch);
        ch.cache = { labels: d.labels, series: d.series, head: d.head, numericCols: [], seriesCols: [], labelCol: -1 };
        ch.tableId = null;
      }
    }
  }

  const topZ = () => Object.values(doc.items).reduce((m, it) => Math.max(m, it.z || 0), 0) + 1;

  function createItem(type, at, extra = {}) {
    if (editing) commitEdit();
    const before = snapshot();
    const id = uid();
    const base = { id, type, x: Math.round(at.x), y: Math.round(at.y), z: topZ() };
    let it;
    if (type === 'note') it = { ...base, w: 220, h: 220, color: noteColor, lines: [''], block: 'p', checked: [] };
    else if (type === 'text') { const td = JSON.parse(pref('mindmap:text') || '{}'); it = { ...base, size: td.size || 'M', color: td.color || 'white', lines: [''], block: 'p', checked: [] }; }
    else if (type === 'sticker') it = { ...base, size: 72, emoji: extra.emoji || '⭐' };
    else if (type === 'shape') {
      const kind = extra.shape || 'rect';
      const [w, h] = (Shapes.CATALOG.find((c) => c[0] === kind) || Shapes.CATALOG[0])[3];
      // Cada tipo de forma recuerda el último color y estilo usados .
      const last = JSON.parse(pref(`mindmap:shape:${kind}`) || '{}');
      it = { ...base, shape: kind, w, h, color: last.color || 'purple', style: last.style || 'border', rot: 0, lines: [''], block: 'p', checked: [] };
    } else if (type === 'section') {
      const n = Object.values(doc.items).filter((x) => x.type === 'section').length + 1;
      it = { ...base, z: 0, w: extra.w || 640, h: extra.h || 420, color: 'gray', fill: false, name: `Sección ${n}` };
    } else if (type === 'video') {
      it = { ...base, w: extra.w || 560, h: extra.h || 315, mediaId: extra.mediaId || null, url: extra.url || null, embed: extra.embed || null, name: extra.name || '' };
    } else it = { ...base, w: extra.w, src: extra.src };
    if (extra.center !== false) {
      const w = it.w || (type === 'sticker' ? it.size + 8 : 120);
      const h = it.h && type !== 'note' ? it.h : type === 'note' ? 220 : type === 'image' ? extra.h || 0 : type === 'sticker' ? it.size + 8 : 30;
      it.x = Math.round(at.x - w / 2);
      it.y = Math.round(at.y - h / 2);
    }
    doc.items[id] = it;
    setTool('select');
    selItem = id;
    selectedId = null;
    if (type === 'note' || type === 'text') { render(); startItemEdit(id, { before }); }
    else if (type === 'section') { commit(before); render(); renameSection(id); }
    else { commit(before); render(); }
    return id;
  }

  // Nota nueva junto a la seleccionada, con su mismo tamaño y color.
  function addNoteNext(dir) {
    const it = doc.items[selItem];
    const r = itemRect(selItem);
    if (!it || !r) return;
    const gap = 24;
    const pos = { right: [r.x + r.w + gap, r.y], left: [r.x - it.w - gap, r.y], down: [r.x, r.y + r.h + gap], up: [r.x, r.y - Math.max(it.h, r.h) - gap] }[dir];
    const prevColor = noteColor;
    noteColor = it.color;
    const id = createItem('note', { x: pos[0], y: pos[1] }, { center: false });
    noteColor = prevColor;
    doc.items[id].w = it.w;
    doc.items[id].h = it.h;
    render();
  }

  function setItem(id, patch) {
    mutate(() => Object.assign(doc.items[id], patch));
  }

  function deleteItem(id = selItem) {
    if (!id || doc.items[id]?.locked) return;
    mutate(() => { if (doc.items[id]?.type === 'table') detachCharts(id); detachConns(new Set([id])); delete doc.items[id]; });
    selItem = null;
    selCell = null;
    render();
  }

  function duplicateItem(id = selItem) {
    const it = doc.items[id];
    if (!it) return;
    const nid = uid();
    mutate(() => { doc.items[nid] = { ...JSON.parse(JSON.stringify(it)), id: nid, x: it.x + 24, y: it.y + 24, z: topZ() }; });
    selectItem(nid);
  }

  function startItemEdit(id, { before = snapshot(), point = null } = {}) {
    const it = doc.items[id];
    if (!it || !it.lines || it.locked) return;
    if (editing) commitEdit();
    selItem = id;
    selectedId = null;
    editing = { kind: 'item', id, before };
    render();
    focusEditable(itemEls.get(id).text, { point, selectAll: !point });
  }

  // Imágenes: se reducen a 1600 px como máximo y se guardan dentro del mapa.
  async function imageFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      let src;
      if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        src = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(file); });
      } else {
        const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        src = c.toDataURL('image/webp', 0.86);
      }
      return { src, w, h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const isMedia = (f) => f.type.startsWith('image/') || f.type.startsWith('video/');
  const MAX_VIDEO = 500 * 1024 * 1024;

  // Imágenes y vídeos (desde el botón, arrastrando archivos o pegando).
  async function addImages(files, at) {
    let i = 0;
    for (const f of files) {
      if (!isMedia(f)) continue;
      const p = { x: at.x + i * 30, y: at.y + i * 30 };
      try {
        if (f.type.startsWith('video/')) await addVideoFile(f, p);
        else {
          const { src, w, h } = await imageFromFile(f);
          const dw = Math.min(480, w);
          createItem('image', p, { src, w: dw, h: (h * dw) / w });
        }
        i++;
      } catch (err) {
        uiAlert(`No se pudo añadir «${f.name}»: ${err.message}`);
      }
    }
  }

  // Vídeos subidos: el archivo va al almacén «media» y el objeto solo guarda su id.
  const mediaURLs = new Map();
  function mediaURL(id, blob) {
    if (!mediaURLs.has(id) && blob) mediaURLs.set(id, URL.createObjectURL(blob));
    return mediaURLs.get(id) || null;
  }
  async function loadMedia(id) {
    if (mediaURLs.has(id)) return mediaURLs.get(id);
    const m = await Store.media.get(id);
    return m ? mediaURL(id, m.blob) : null;
  }
  function videoSize(url) {
    return new Promise((ok, ko) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => ok([v.videoWidth || 16, v.videoHeight || 9]);
      v.onerror = () => ko(new Error('el navegador no puede reproducir este formato'));
      v.src = url;
    });
  }
  async function addVideoFile(f, at) {
    if (f.size > MAX_VIDEO) throw new Error('el vídeo pasa de 500 MB');
    const id = uid();
    const url = mediaURL(id, f);
    const [vw, vh] = await videoSize(url);
    await Store.media.put({ id, blob: f, type: f.type, name: f.name });
    const w = Math.min(560, vw);
    createItem('video', at, { mediaId: id, w, h: Math.round((w * vh) / vw), name: f.name });
  }

  // Enlaces de vídeo: YouTube, Vimeo y Loom con su reproductor; un archivo .mp4/.webm/.mov directo, con el del navegador.
  function videoEmbed(text) {
    try {
      const u = new URL(text);
      if (!/^https?:$/.test(u.protocol)) return null;
      const id = (v) => (v && /^[\w-]{6,40}$/.test(v) ? v : null);
      let v;
      if (/(^|\.)youtube\.com$/.test(u.hostname) && (v = id(u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1]))) return { embed: `https://www.youtube-nocookie.com/embed/${v}` };
      if (u.hostname === 'youtu.be' && (v = id(u.pathname.slice(1).split('/')[0]))) return { embed: `https://www.youtube-nocookie.com/embed/${v}` };
      if (/(^|\.)vimeo\.com$/.test(u.hostname) && (v = (u.pathname.match(/\/(\d{6,})/) || [])[1])) return { embed: `https://player.vimeo.com/video/${v}` };
      if (/(^|\.)loom\.com$/.test(u.hostname) && (v = id((u.pathname.match(/\/(?:share|embed)\/([\w-]+)/) || [])[1]))) return { embed: `https://www.loom.com/embed/${v}` };
      if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(u.pathname)) return { url: u.href };
    } catch { /* no es una URL */ }
    return null;
  }

  function insertVideoLink(text, at) {
    const v = videoEmbed(String(text || '').trim());
    if (!v) return false;
    createItem('video', at || viewCenter(), { ...v, w: 560, h: 315 });
    return true;
  }

  // Dibujo de un vídeo. La capa «grip» permite seleccionar y arrastrar; con el vídeo seleccionado deja libres
  // los controles (abajo en un archivo; todo salvo una franja superior en YouTube, Vimeo o Loom).
  function drawVideo(rec, it) {
    const host = rec.el.querySelector('.video-host');
    const sig = `${it.mediaId}|${it.url}|${it.embed}`;
    if (rec.videoSig !== sig) {
      rec.videoSig = sig;
      if (it.embed) {
        host.innerHTML = `<iframe src="${esc(it.embed)}" title="Vídeo" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen ` +
          'referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"></iframe><div class="video-grip"></div>';
      } else {
        host.innerHTML = '<video controls playsinline preload="metadata"></video><div class="video-grip"></div>';
        const v = host.querySelector('video');
        if (it.url) v.src = it.url;
        else if (it.mediaId) loadMedia(it.mediaId).then((u) => { if (u) v.src = u; else host.innerHTML = '<div class="video-missing">Este vídeo no está en este navegador</div><div class="video-grip"></div>'; });
      }
    }
    rec.el.classList.toggle('is-embed', !!it.embed);
    const v = host.querySelector('video');
    if (v) v.loop = !!it.loop;
  }

  function toggleVideo(id) {
    const v = itemEls.get(id)?.el.querySelector('video');
    if (v) { if (v.paused) v.play().catch(() => {}); else v.pause(); }
  }

  // ---------- Herramientas (barra vertical) ----------

  function setTool(t) {
    tool = t;
    document.querySelectorAll('#toolbox .tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t.split(':')[0]));
    stage.classList.toggle('placing', isPlacing(t));
    stage.classList.toggle('hand', t === 'hand');
    stage.classList.toggle('connecting', t === 'conn');
    if (t !== 'draw') selInks.clear();
    syncDrawbox();
  }

  // Coloca el objeto de la herramienta en `at` (coordenadas del mundo).
  const isPlacing = (t) => ['note', 'text', 'section', 'mindmap'].includes(t) || t.startsWith('shape:');

  $('#csv-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importCSVFile(f, pendingTable || viewCenter());
    pendingTable = null;
  });

  function placeTool(t, at) {
    if (t === 'table') { pendingTable = at; return openPopover('menu-table-new', $('#toolbox [data-tool="table"]')); }
    if (t === 'note' || t === 'text' || t === 'section') return createItem(t, at);
    if (t === 'mindmap') return createMindmap(at);
    if (t.startsWith('shape:')) return createItem('shape', at, { shape: t.slice(6) });
    if (t === 'shape') return openPopover('menu-shapes', $('#toolbox [data-tool="shape"]'));
    if (t === 'sticker') { pendingSticker = at; return openPopover('menu-sticker', $('#toolbox [data-tool="sticker"]')); }
    if (t === 'image') { pendingImage = at; return openPopover('menu-media', $('#toolbox [data-tool="image"]')); }
  }

  let pendingSticker = null;
  let pendingImage = null;
  let lastShape = pref('mindmap:lastShape') || 'rect';
  let pendingTable = null;
  const here = () => mouseWorld || viewCenter();

  const toolbox = $('#toolbox');
  toolbox.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    b.setPointerCapture(e.pointerId);
    b.dataset.down = '1';
  });
  // Clic: activa la herramienta. Arrastrar el botón al lienzo: lo coloca donde se suelta.
  toolbox.addEventListener('pointerup', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b || !b.dataset.down) return;
    delete b.dataset.down;
    const t = b.dataset.tool;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const onCanvas = over && stage.contains(over) && !over.closest('#toolbox, #contextbar, #popover, #zoombar');
    if (onCanvas && t === 'shape') return placeTool(`shape:${lastShape}`, toWorld(e.clientX, e.clientY));
    if (onCanvas && !['select', 'hand', 'conn', 'draw'].includes(t)) return placeTool(t, toWorld(e.clientX, e.clientY));
    if (t === 'shape') return placeTool('shape');
    if (t === 'table') return placeTool('table', viewCenter());
    if (t === 'image') return placeTool('image', viewCenter());
    if (t === 'sticker') return placeTool('sticker', viewCenter());
    setTool(tool === t && t !== 'select' ? 'select' : t);
  });

  $('#image-file').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) addImages(files, pendingImage || viewCenter());
    pendingImage = null;
  });

  stage.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  stage.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer.files || [])];
    if (!files.length) return;
    e.preventDefault();
    const at = toWorld(e.clientX, e.clientY);
    for (const f of files) if (/\.(csv|tsv)$/i.test(f.name) || /csv|tab-separated/.test(f.type)) importCSVFile(f, at);
    addImages(files.filter(isMedia), at);
  });

  // ---------- Edición de texto en el propio objeto ----------

  function focusEditable(textEl, { point = null, selectAll = true, replace = null } = {}) {
    textEl.contentEditable = 'true';
    textEl.focus();
    const sel = getSelection();
    if (point && document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(point.x, point.y);
      if (r && textEl.contains(r.startContainer)) { sel.removeAllRanges(); sel.addRange(r); return; }
    }
    const range = document.createRange();
    range.selectNodeContents(textEl);
    if (!selectAll || replace != null) range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function startEdit(id, { before = snapshot(), point = null } = {}) {
    if (editing && !(editing.kind === 'node' && editing.id === id)) commitEdit();
    selectedId = id;
    selItem = null;
    editing = { kind: 'node', id, before };
    render();
    const rec = els.get(id);
    if (!rec) return;
    focusEditable(rec.text, { point, selectAll: !point });
    ensureVisibleRect(layout.boxes[id]);
    render();
  }

  const editTarget = () => (!editing || editing.kind === 'cell' ? null : editing.kind === 'node' ? doc.nodes[editing.id] : doc.items[editing.id]);
  const editEl = () => {
    if (!editing) return null;
    if (editing.kind === 'node') return els.get(editing.id)?.text;
    if (editing.kind === 'cell') return itemEls.get(editing.id)?.el.querySelector(`${cellKey(editing.r, editing.c)} .cell`);
    return itemEls.get(editing.id)?.text;
  };
  // Contenido de una celda: HTML en línea saneado, con <br> para los saltos de línea.
  const readCell = (el) => sanitize(el.innerHTML.replace(/<div>/gi, '<br>').replace(/<\/div>/gi, ''));

  function commitEdit() {
    if (!editing) return;
    if (editing.kind === 'cell') {
      const { id, r, c, before } = editing;
      const el = editEl(), t = doc.items[id];
      editing = null;
      if (el && t && t.rows[r]) { t.rows[r][c] = readCell(el); el.contentEditable = 'false'; el.blur(); }
      const rec = itemEls.get(id);
      if (rec) rec.sig = '';
      commit(before);
      return render();
    }
    const target = editTarget(), el = editEl();
    const { before, kind, id } = editing;
    editing = null;
    if (el) {
      if (target) storeEditor(target, el);
      el.contentEditable = 'false';
      el.blur();
      const rec = kind === 'node' ? els.get(id) : itemEls.get(id);
      if (rec) rec.sig = '';
    }
    // Un texto libre que se queda vacío se elimina.
    if (kind === 'item' && target && target.type === 'text' && target.lines.every((l) => !l.trim())) {
      delete doc.items[id];
      if (selItem === id) selItem = null;
    }
    commit(before);
    render();
  }

  // Atajos tipo markdown al empezar: "* ", "- ", "1. ", "_ ", "# ".
  const MD = [[/^[*-]\s/, 'ul'], [/^1\.\s/, 'ol'], [/^_\s/, 'check'], [/^###\s/, 'h3'], [/^##\s/, 'h2'], [/^#\s/, 'h1']];

  function onEditorInput() {
    if (editing && editing.kind === 'cell') {
      // La celda se guarda en vivo para que los gráficos enlazados se actualicen mientras escribes.
      const el = editEl(), t = doc.items[editing.id];
      if (el && t) t.rows[editing.r][editing.c] = readCell(el);
      return renderItems();
    }
    const target = editTarget(), el = editEl();
    if (!target || !el) return;
    const sel = getSelection();
    const at = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const ln = at && at.closest('.ln');
    if (ln && el.contains(ln)) {
      const text = ln.textContent.replace(/\u00a0/g, ' ');
      for (const [re, block] of MD) {
        if (re.test(text) && lineBlock(ln) !== block) {
          setLineBlock(ln, block);
          ln.innerHTML = esc(text.slice(text.match(re)[0].length)) || '<br>';
          const r = document.createRange();
          r.selectNodeContents(ln);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
          break;
        }
      }
    }
    storeEditor(target, el);
    render();
  }

  // Parte la línea actual en dos (Shift+Enter en nodos, Enter en notas y textos).
  function splitLine(textEl) {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    let ln = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('.ln');
    if (!ln || !textEl.contains(ln)) {
      textEl.innerHTML = contentHTML({ lines: readEditor(textEl), block: 'p', checked: [] });
      ln = textEl.lastElementChild;
      r.selectNodeContents(ln);
      r.collapse(false);
    }
    const b = lineBlock(ln);
    const list = ['ul', 'ol', 'check'].includes(b);
    if (list && !ln.textContent.trim()) { setLineBlock(ln, 'p'); return onEditorInput(); }
    const tail = document.createRange();
    tail.setStart(r.startContainer, r.startOffset);
    tail.setEnd(ln, ln.childNodes.length);
    const nl = document.createElement('div');
    nl.className = `ln b-${list ? b : 'p'}`;
    nl.appendChild(tail.extractContents());
    if (!nl.textContent) nl.innerHTML = '<br>';
    if (!ln.textContent && !ln.querySelector('br')) ln.innerHTML = '<br>';
    ln.after(nl);
    const c = document.createRange();
    c.setStart(nl, 0);
    c.collapse(true);
    sel.removeAllRanges();
    sel.addRange(c);
    onEditorInput();
  }

  // Envuelve la selección con <code> o <mark>, o la desenvuelve si ya lo está.
  function toggleWrap(tag) {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const anc = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement).closest(tag);
    if (anc) anc.replaceWith(...anc.childNodes);
    else if (!r.collapsed) {
      const el = document.createElement(tag);
      el.appendChild(r.extractContents());
      r.insertNode(el);
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  // Quita el color (o el resaltado) de lo seleccionado.
  function clearInlineStyle(prop) {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const start = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    const root = start && start.closest('.mm-text');
    if (!root) return;
    for (const sp of root.querySelectorAll('span, font, mark')) {
      if (!r.intersectsNode(sp)) continue;
      if (sp.tagName === 'MARK') { if (prop === 'background-color') sp.replaceWith(...sp.childNodes); continue; }
      if (sp.tagName === 'FONT') { if (prop === 'color') sp.removeAttribute('color'); continue; }
      sp.style.removeProperty(prop);
    }
  }

  // Enlace: un campo bajo la barra (no un cuadro del navegador). Se guarda la selección del texto antes de
  // que el foco pase al campo, y se recupera al aplicar el enlace.
  let linkRange = null;
  function openLinkBox() {
    const sel = getSelection();
    const el = editing && editing.kind !== 'cell' ? editEl() : null;
    linkRange = el && sel.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0).cloneRange() : null;
    openPopover('menu-link', bar.querySelector('[data-act="link"]') || bar);
  }
  function currentLink() {
    const r = linkRange;
    const n = r && (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement);
    return n ? n.closest('a') : null;
  }
  function restoreLinkRange() {
    const el = editing && editing.kind !== 'cell' ? editEl() : null;
    if (!el || !linkRange) return;
    el.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(linkRange);
  }
  function submitLink(raw) {
    let url = String(raw || '').trim();
    closePopover();
    if (!url) return restoreLinkRange();
    if (!/^(https?:|mailto:)/i.test(url)) url = /@/.test(url) && !/\//.test(url) ? `mailto:${url}` : `https://${url}`;
    restoreLinkRange();
    inlineFormat(`link:${url}`);
  }

  // Formato en línea: si se está editando, sobre la selección; si no, sobre todo el texto.
  function inlineFormat(kind) {
    if (kind === 'link') return openLinkBox();
    const run = () => {
      if (kind === 'bold') document.execCommand('bold');
      else if (kind === 'italic') document.execCommand('italic');
      else if (kind === 'strike') document.execCommand('strikeThrough');
      else if (kind === 'code') toggleWrap('code');
      else if (kind === 'mark') toggleWrap('mark');
      else if (kind.startsWith('link:')) document.execCommand('createLink', false, kind.slice(5));
      else if (kind === 'unlink') { const a = currentLink(); if (a) { const r = document.createRange(); r.selectNodeContents(a); getSelection().removeAllRanges(); getSelection().addRange(r); } document.execCommand('unlink'); }
      else if (kind.startsWith('color:') || kind.startsWith('hilite:')) {
        const k = kind.slice(0, kind.indexOf(':')), v = kind.slice(kind.indexOf(':') + 1);
        if (v) {
          document.execCommand('styleWithCSS', false, true);
          document.execCommand(k === 'color' ? 'foreColor' : 'hiliteColor', false, v);
          document.execCommand('styleWithCSS', false, false);
        } else clearInlineStyle(k === 'color' ? 'color' : 'background-color');
      }
    };
    if (editing) { run(); onEditorInput(); return; }
    // Celda seleccionada sin editar: el formato se aplica a toda la celda.
    if (selItem && doc.items[selItem]?.type === 'table' && selCell) {
      startCellEdit(selItem, selCell.r, selCell.c, { selectAll: true });
      run();
      onEditorInput();
      return commitEdit();
    }
    const target = textTarget();
    const el = selItem ? itemEls.get(selItem)?.text : selectedId ? els.get(selectedId)?.text : null;
    if (!target || !el || !target.lines) return;
    const before = snapshot();
    el.contentEditable = 'true';
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    run();
    storeEditor(target, el);
    el.contentEditable = 'false';
    const rec = selItem ? itemEls.get(selItem) : els.get(selectedId);
    rec.sig = '';
    getSelection().removeAllRanges();
    commit(before);
    render();
  }

  // ---------- Navegación con flechas ----------

  function navigate(dir) {
    const cur = layout.boxes[selectedId];
    if (!cur) return selectNode(doc.rootId);
    const v = cur.vertical;
    const outward = cur.level === 0 ? null : v ? (cur.dir > 0 ? 'down' : 'up') : (cur.dir > 0 ? 'right' : 'left');
    if (dir === outward && cur.collapsed && cur.children.length) {
      toggleCollapse(selectedId);
      return selectNode(cur.children[0]);
    }
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    const vec = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
    let best = null, bestScore = Infinity;
    for (const b of Object.values(layout.boxes)) {
      if (!b.visible || b.id === selectedId) continue;
      const dx = b.x + b.w / 2 - cx, dy = b.y + b.h / 2 - cy;
      const along = dx * vec[0] + dy * vec[1];
      if (along <= 4) continue;
      const score = along + Math.abs(dx * vec[1] - dy * vec[0]) * 2.5;
      if (score < bestScore) { bestScore = score; best = b.id; }
    }
    if (best) selectNode(best);
  }

  // Alt + flecha: hacia fuera = hijo, hacia dentro = padre, a los lados = hermano.
  function quickAddDir(dir) {
    if (selItem && doc.items[selItem]?.type === 'note') return addNoteNext(dir);
    const cur = layout.boxes[selectedId];
    if (!cur) return;
    const v = cur.vertical;
    if (cur.level === 0) {
      const m = v ? { down: 0, up: 1 } : { right: 0, left: 1 };
      if (dir in m) addChild(selectedId, outerSides(selectedId)[m[dir]]);
      return;
    }
    const out = v ? (cur.dir > 0 ? 'down' : 'up') : (cur.dir > 0 ? 'right' : 'left');
    const inn = { right: 'left', left: 'right', up: 'down', down: 'up' }[out];
    if (dir === out) addChild(selectedId);
    else if (dir === inn) addParent(selectedId);
    else addSibling(selectedId, v ? dir === 'left' : dir === 'up');
  }

  // ---------- Arrastrar ramas ----------

  function findSlot(p, dragId) {
    const excluded = new Set(subtreeIds(dragId));
    let near = null, nearD = Infinity;
    for (const b of Object.values(layout.boxes)) {
      if (!b.visible || excluded.has(b.id)) continue;
      const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
      const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
      const dist = Math.hypot(dx, dy);
      if (dist < nearD) { nearD = dist; near = b; }
    }
    if (!near) return null;
    const v = near.vertical;
    const cross = v ? p.x : p.y;
    const crossOf = (b) => (v ? b.x + b.w / 2 : b.y + b.h / 2);
    const beforeAmong = (parentId, side) => {
      const sibs = layout.boxes[parentId].children
        .filter((id) => !excluded.has(id) && layout.boxes[id].visible && (!side || layout.boxes[id].side === side));
      return sibs.find((id) => crossOf(layout.boxes[id]) > cross) || null;
    };
    if (near.level === 0) {
      const sides = outerSides(near.id);
      const side = (v ? p.y < near.y + near.h / 2 : p.x < near.x + near.w / 2) ? sides[1] : sides[0];
      return { parentId: near.id, beforeId: beforeAmong(near.id, side), side };
    }
    const beyond = v
      ? (near.dir > 0 ? p.y > near.y + near.h + 24 : p.y < near.y - 24)
      : (near.dir > 0 ? p.x > near.x + near.w + 30 : p.x < near.x - 30);
    if (beyond) return { parentId: near.id, beforeId: beforeAmong(near.id), side: near.side };
    const parent = layout.boxes[near.parentId];
    const side = parent.level === 0 ? near.side : null;
    if (cross < crossOf(near)) return { parentId: near.parentId, beforeId: near.id, side };
    const sibs = parent.children.filter((id) => !excluded.has(id) && (!side || layout.boxes[id].side === side));
    return { parentId: near.parentId, beforeId: sibs[sibs.indexOf(near.id) + 1] || null, side };
  }

  const sameSlot = (a, b) => a && b && a.parentId === b.parentId && a.beforeId === b.beforeId && a.side === b.side;

  function previewDrag() {
    if (!drag || !drag.active) return;
    const slot = findSlot(drag.world, drag.id);
    if (!slot || sameSlot(slot, drag.slot)) return;
    drag.slot = slot;
    const preview = JSON.parse(snapshot());
    applyMove(preview, drag.id, slot);
    render(preview);
  }

  // ---------- Barra contextual ----------

  const btn = (act, icon, tipText, { on = false, menu = false, arg = '', cls = '' } = {}) =>
    `<button class="cb-btn${on ? ' on' : ''}${menu ? ' has-menu' : ''}${cls ? ` ${cls}` : ''}" data-act="${act}" data-arg="${arg}" data-tip="${tipText}">${icon}</button>`;
  const sep = '<span class="cb-sep"></span>';
  const textTools = (t) => [
    `<span class="cb-group">${btn('bold', UI.bold, 'Negrita · Ctrl B')}${btn('italic', UI.italic, 'Cursiva · Ctrl I')}${btn('menu-format', UI.kebab, 'Más formato', { cls: 'narrow' })}</span>`,
    `<span class="cb-group">${btn('block', UI.list, 'Lista de viñetas · *', { on: curBlock(t) === 'ul', arg: 'ul' })}${btn('menu-block', UI.kebab, 'Más tipos de bloque', { cls: 'narrow' })}</span>`,
    btn('menu-fmt-color', UI.textColor, 'Color y resaltado del texto', { menu: true }),
    ...(t.type === 'note' || t.type === 'text' || t.type === 'shape' ? [btn('menu-align', UI[`align${(t.align || (t.type === 'shape' ? 'center' : 'left'))[0].toUpperCase()}Text`], 'Alineación del texto', { menu: true })] : []),
    sep, btn('link', UI.link, 'Añadir enlace · Ctrl Shift U'),
  ];

  // Miniatura de una punta de conector (al final de una línea corta; `atStart` la dibuja a la izquierda).
  const capThumb = (kind, atStart) => {
    const p = atStart ? [5, 10] : [23, 10];
    const body = kind === 'none' ? '' : Conn.cap(kind, p, atStart ? [-1, 0] : [1, 0], 'currentColor', 1.6, theme === 'light' ? '#ffffff' : '#2a3441');
    return `<svg viewBox="0 0 28 20" width="28" height="20"><path d="M5 10H23" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>${body}</svg>`;
  };
  const routeIcon = (r) => ({ straight: UI.straight, curve: UI.curve, elbow: UI.elbow }[r || 'elbow']);

  // Barra de trazos: uno seleccionado (it) o varios elegidos con el lazo (it = null).
  function inkBar(it) {
    const color = it ? it.color : doc.items[[...selInks][0]]?.color;
    const thick = it ? it.width >= 6 : false;
    const parts = [btn('menu-ink-color', `<span class="swatch" style="background:${inkColor(color)}"></span>`, 'Color', { menu: true }),
      `<span class="cb-group">${btn('ink-width', UI.thin, 'Trazo fino', { on: !thick, arg: '0' })}${btn('ink-width', UI.thick, 'Trazo grueso', { on: thick, arg: '1' })}</span>`, sep];
    if (it) parts.push(btn('item-dup', UI.duplicate, 'Duplicar · Ctrl D'), btn('menu-item-more', UI.more, 'Más'));
    else parts.push(btn('ink-del', UI.trash, `Borrar ${selInks.size} trazo${selInks.size === 1 ? '' : 's'} · Supr`));
    return parts.join('');
  }

  function itemBar(it) {
    if (it.locked) return btn('item-unlock', UI.lock, 'Desbloquear · Shift L', { on: true });
    if (it.type === 'ink') return inkBar(it);
    if (it.type === 'conn') {
      const st = it.style || 'solid';
      return [btn('menu-conn-label', UI.text, 'Texto · doble clic', { on: !!it.label }), sep,
        btn('menu-conn-color', `<span class="swatch" style="background:${connColor(it)}"></span>`, 'Color', { menu: true }), sep,
        `<span class="cb-group">${btn('conn-style', UI.solid, 'Continua', { on: st === 'solid', arg: 'solid' })}${btn('conn-style', UI.dash, 'Discontinua', { on: st === 'dashed', arg: 'dashed' })}${btn('conn-style', UI.lineThick, 'Gruesa', { on: st === 'thick', arg: 'thick' })}</span>`, sep,
        btn('menu-conn-cap', capThumb(it.startCap, true), 'Punta inicial', { menu: true, arg: 'startCap' }),
        btn('conn-swap', UI.swap, 'Invertir dirección'),
        btn('menu-conn-cap', capThumb(it.endCap, false), 'Punta final', { menu: true, arg: 'endCap' }), sep,
        btn('menu-conn-route', routeIcon(it.route), 'Trazado', { menu: true }), sep,
        btn('item-dup', UI.duplicate, 'Duplicar · Ctrl D'), btn('menu-item-more', UI.more, 'Más')].join('');
    }
    const parts = [];
    if (it.type === 'note') {
      parts.push(...textTools(it), sep, btn('menu-note-color', `<span class="swatch" style="background:${NOTE_COLORS[it.color] || it.color}"></span>`, 'Color de la nota', { menu: true }));
    } else if (it.type === 'text') {
      parts.push(...textTools(it), sep, btn('menu-text-size', `<b style="font-size:13px">${it.size}</b>`, 'Tamaño del texto', { menu: true }),
        btn('menu-text-color', `<span class="swatch" style="background:${TEXT_COLORS[it.color] || it.color}"></span>`, 'Color del texto', { menu: true }));
    } else if (it.type === 'sticker') {
      parts.push(btn('menu-sticker', `<span style="font-size:18px">${it.emoji}</span>`, 'Cambiar sticker', { menu: true }));
    } else if (it.type === 'image') {
      parts.push(btn('item-download', UI.download, 'Descargar imagen'));
    } else if (it.type === 'video') {
      if (!it.embed) parts.push(btn('video-loop', UI.loop, 'Repetir en bucle', { on: !!it.loop }));
      if (it.mediaId) parts.push(btn('item-download', UI.download, 'Descargar vídeo'));
      if (it.embed || it.url) parts.push(btn('video-open', UI.external, 'Abrir el original'));
    } else if (it.type === 'table') {
      const cellOn = !!(selCell || (editing && editing.kind === 'cell'));
      if (cellOn) parts.push(`<span class="cb-group">${btn('bold', UI.bold, 'Negrita · Ctrl B')}${btn('italic', UI.italic, 'Cursiva · Ctrl I')}</span>`, sep);
      parts.push(btn('menu-table-rows', UI.rowsCols, 'Filas y columnas', { menu: true }),
        btn('tbl-sort', UI.sortAsc, 'Ordenar A → Z (columna activa)', { arg: 'asc' }), btn('tbl-sort', UI.sortDesc, 'Ordenar Z → A (columna activa)', { arg: 'desc' }), sep,
        btn('tbl-header', UI.header, 'Fila de encabezado', { on: it.header !== false }), btn('tbl-striped', UI.striped, 'Filas alternas', { on: !!it.striped }),
        btn('menu-table-color', `<span class="swatch" style="background:${SECTION_COLORS[it.color] || it.color}"></span>`, 'Color', { menu: true }), sep,
        btn('menu-chart-new', UI.chart, 'Crear gráfico con estos datos', { menu: true }), btn('tbl-csv', UI.csv, 'Exportar CSV'));
    } else if (it.type === 'chart') {
      const linked = it.tableId && doc.items[it.tableId];
      parts.push(btn('menu-chart-type', Charts.thumb(it.kind), 'Tipo de gráfico', { menu: true }),
        btn('menu-chart-data', UI.table, linked ? 'Datos' : 'Datos (tabla borrada)', { menu: true }),
        btn('menu-chart-title', UI.pencil, 'Título', { menu: true }));
      if (/^(column|bar)/.test(it.kind)) parts.push(btn('chart-values', `<b style="font-size:12px">123</b>`, 'Mostrar valores', { on: !!it.showValues }));
      if (linked) parts.push(sep, btn('chart-goto', UI.table, 'Ir a la tabla'));
    } else if (it.type === 'shape') {
      parts.push(...textTools(it), sep,
        btn('menu-shape-type', Shapes.thumb(it.shape), 'Cambiar forma', { menu: true }),
        btn('menu-shape-color', `<span class="swatch" style="background:${SHAPE_COLORS[it.color] || it.color}"></span>`, 'Color', { menu: true }),
        btn('menu-shape-style', UI.fill, 'Estilo del borde', { menu: true }),
        btn('shape-rot', UI.rotate, 'Girar 90°'));
    } else if (it.type === 'section') {
      return [btn('section-rename', UI.pencil, 'Renombrar · Enter'), sep,
        btn('menu-section-color', `<span class="swatch" style="background:${SECTION_COLORS[it.color] || it.color}"></span>`, 'Color', { menu: true }),
        `<span class="cb-group">${btn('section-fill', UI.section, 'Contorno', { on: !it.fill, arg: '0' })}${btn('section-fill', UI.fill, 'Relleno', { on: !!it.fill, arg: '1' })}</span>`,
        sep, btn('menu-section-more', UI.more, 'Más')].join('');
    }
    parts.push(sep, btn('item-dup', UI.duplicate, 'Duplicar · Ctrl D'), btn('menu-item-more', UI.more, 'Más'));
    return parts.join('');
  }

  function nodeBar(b) {
    const n = doc.nodes[selectedId];
    const isRoot = b.level === 0;
    const parts = [...textTools(n), sep];
    if (isRoot) {
      const ms = mapSettings(doc, selectedId);
      parts.push(`<span class="cb-group">${btn('layout', UI.horizontal, 'Horizontal', { on: ms.layout !== 'vertical', arg: 'horizontal' })}${btn('layout', UI.vertical, 'Vertical', { on: ms.layout === 'vertical', arg: 'vertical' })}</span>`);
      parts.push(`<span class="cb-group">${btn('lines', UI.curvy, 'Curvas', { on: ms.lines !== 'angular', arg: 'curvy' })}${btn('lines', UI.angular, 'En ángulo', { on: ms.lines === 'angular', arg: 'angular' })}</span>`);
    } else {
      parts.push(`<span class="cb-group">${btn('dash', UI.solid, 'Línea continua', { on: !b.dash, arg: '0' })}${btn('dash', UI.dash, 'Línea discontinua', { on: b.dash, arg: '1' })}</span>`);
      parts.push(sep, btn('menu-color', `<span class="swatch" style="background:${colorOf(b.color)}"></span>`, 'Color', { menu: true }));
    }
    parts.push(sep, btn('menu-icon', UI.smile, 'Añadir icono · Shift X', { menu: true }));
    if (b.children.length) parts.push(btn('collapse', UI.collapse, isRoot ? 'Plegar ramas · Ctrl /' : (b.collapsed ? 'Desplegar · Ctrl /' : 'Plegar · Ctrl /')));
    parts.push(btn('duplicate', UI.duplicate, isRoot ? 'Duplicar el mapa · Ctrl D' : 'Duplicar · Ctrl D'));
    parts.push(sep, btn('menu-more', UI.more, 'Más'));
    return parts.join('');
  }

  function updateContextbar() {
    const busy = drag && (drag.active || (drag.kind && drag.moving));
    const b = selectedId && layout && layout.boxes[selectedId];
    const it = selItem && doc.items[selItem];
    if (!busy && multiCount() > 1) { bar.innerHTML = multiBar(); bar.hidden = false; positionContextbar(); return; }
    if (!busy && !it && selInks.size) { bar.innerHTML = inkBar(null); bar.hidden = false; positionContextbar(); return; }
    if (busy || (!it && !(b && b.visible))) { bar.hidden = true; return; }
    bar.innerHTML = it ? itemBar(it) : nodeBar(b);
    bar.hidden = false;
    positionContextbar();
  }

  // Límites de un conector (para colocar su barra).
  function connBounds(c) {
    const g = connGeom(c);
    if (!g) return null;
    const xs = g.samples.map((p) => p[0]), ys = g.samples.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  function positionContextbar() {
    if (bar.hidden || !layout) return;
    const si = selItem && doc.items[selItem];
    const b = multiCount() > 1 ? multiBounds() : si ? (si.type === 'conn' ? connBounds(si) : itemRect(selItem)) : selectedId ? layout.boxes[selectedId] : selInks.size ? selInkBounds() : null;
    if (!b) return;
    const r = stageRect();
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    const sx = b.x * view.k + view.x, sy = b.y * view.k + view.y;
    let left = sx + (b.w * view.k) / 2 - bw / 2;
    left = Math.max(60, Math.min(r.width - bw - 8, left));
    let top = sy - bh - (selItem || multiCount() > 1 ? 28 : 14);
    if (top < 8) top = sy + b.h * view.k + 34;
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
  }

  // ---------- Menús desplegables ----------

  const keys = (k) => (k ? `<span class="keys">${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}</span>` : '');
  const item = (act, label, k = '', arg = '', on = false) =>
    `<button class="menu-item${on ? ' on' : ''}" data-act="${act}" data-arg="${arg}">${label}${keys(k)}</button>`;
  const dots = (palette, current, act) => `<div class="colors">${Object.entries(palette).map(([k, c]) =>
    `<button class="color-dot${current === k ? ' on' : ''}" data-act="${act}" data-arg="${k}" style="background:${c}" data-tip="${k}"></button>`).join('')}`;

  function openPopover(kind, anchor) {
    const t = textTarget();
    const it = selItem && doc.items[selItem];
    let html = '';
    if (kind === 'menu-format') {
      html = item('strike', 'Tachado', 'Ctrl Shift X') + item('code', 'Código', 'Ctrl Shift K') + item('mark', 'Resaltado', 'Ctrl Shift H');
    } else if (kind === 'menu-block') {
      const blocks = [['p', 'Párrafo'], ['h1', 'Título 1', '#'], ['h2', 'Título 2', '##'], ['h3', 'Título 3', '###'], ['ul', 'Lista de viñetas', '*'], ['ol', 'Lista numerada', '1.'], ['check', 'Checklist', '_']];
      const cb = t && curBlock(t);
      html = blocks.map(([k, label, kk]) => item('block-set', label, kk || '', k, cb === k)).join('');
    } else if (kind === 'menu-fmt-color') {
      const sw = (act, v, c, tip, cls = '') => `<button class="color-dot${cls}" data-act="${act}" data-arg="${v}" style="background:${c}" data-tip="${tip}"></button>`;
      html = `<div class="menu-label">Color del texto</div><div class="colors">${sw('fmt', 'color:', 'transparent', 'Sin color', ' none')}` +
        Object.entries(FMT_COLORS).map(([k, c]) => sw('fmt', `color:${c}`, c, k)).join('') +
        `</div><div class="menu-label">Resaltado</div><div class="colors">${sw('fmt', 'hilite:', 'transparent', 'Sin resaltado', ' none')}` +
        Object.entries(FMT_HILITES).map(([k, c]) => sw('fmt', `hilite:${c}`, c, k)).join('') + '</div>';
    } else if (kind === 'menu-link') {
      const cur = currentLink();
      html = '<div class="menu-label">Dirección del enlace</div>' +
        `<input class="title-input link-url" placeholder="https://…" spellcheck="false" value="${cur ? esc(cur.getAttribute('href') || '') : ''}" />` +
        (cur ? item('link-remove', 'Quitar enlace') : '');
    } else if (kind === 'menu-media') {
      html = item('media-file', `${UI.upload} Subir imagen o vídeo…`) + '<div class="menu-sep"></div>' +
        '<div class="menu-label">O pega el enlace de un vídeo<br>(YouTube, Vimeo, Loom o .mp4)</div>' +
        '<input class="title-input media-url" placeholder="https://…" spellcheck="false" /><div class="media-hint" hidden>No reconozco ese enlace</div>';
    } else if (kind === 'menu-theme') {
      html = [['dark', 'Oscuro', UI.moon], ['light', 'Claro', UI.sun], ['system', 'Según el sistema', UI.monitor]]
        .map(([k, label, ic]) => `<button class="menu-item${themePref === k ? ' on' : ''}" data-act="theme" data-arg="${k}">${ic} ${label}</button>`).join('');
    } else if (kind === 'menu-align') {
      const cur = it && (it.align || (it.type === 'shape' ? 'center' : 'left'));
      html = [['left', 'A la izquierda', UI.alignLText], ['center', 'Centrado', UI.alignCText], ['right', 'A la derecha', UI.alignRText]]
        .map(([k, label, ic]) => `<button class="menu-item${cur === k ? ' on' : ''}" data-act="text-align" data-arg="${k}">${ic} ${label}</button>`).join('');
    } else if (kind === 'menu-color') {
      const b = layout.boxes[selectedId];
      html = `${dots(L.PALETTE, b.color, 'color')}<label class="color-dot custom" data-tip="Color personalizado">+<input type="color" data-act="color-custom" /></label></div>`;
    } else if (kind === 'menu-note-color') {
      html = `${dots(NOTE_COLORS, it.color, 'note-color')}</div>`;
    } else if (kind === 'menu-text-color') {
      html = `${dots(TEXT_COLORS, it.color, 'text-color')}</div>`;
    } else if (kind === 'menu-text-size') {
      html = `<div class="size-grid">${TEXT_SIZES.map(([s]) => `<button class="size-btn${it.size === s ? ' on' : ''}" data-act="text-size" data-arg="${s}">${s}</button>`).join('')}</div>`;
    } else if (kind === 'menu-icon' || kind === 'menu-sticker') {
      const act = kind === 'menu-icon' ? 'icon' : 'sticker';
      html = `<div class="icon-panel"><input class="icon-search" placeholder="${act === 'icon' ? 'Buscar icono…' : 'Buscar sticker…'}" />` +
        `<div class="icon-results">${iconGrid('', act)}</div>` +
        (act === 'icon' && t && t.icon ? `<div class="menu-sep"></div>${item('icon', 'Quitar icono', '', '')}` : '') + '</div>';
    } else if (kind === 'menu-more') {
      const root = selectedId === doc.rootId;
      html = item('copy', 'Copiar', 'Ctrl C') + (root ? '' : item('cut', 'Cortar', 'Ctrl X')) + item('paste', 'Pegar como hijo', 'Ctrl V') +
        (root ? '' : item('duplicate', 'Duplicar', 'Ctrl D')) + '<div class="menu-sep"></div>' +
        item('wrap-section', 'Meter el mapa en una sección') +
        item('export-png', 'Exportar mapa como PNG') + item('export-svg', 'Exportar mapa como SVG') +
        (root ? '' : `<div class="menu-sep"></div>${item('delete', 'Borrar', 'Supr')}`);
    } else if (kind === 'menu-item-more') {
      html = item('item-front', 'Traer al frente') + item('item-back', 'Enviar detrás del mapa') + item('item-dup', 'Duplicar', 'Ctrl D') +
        item('wrap-section', 'Meter en sección') + item('item-lock', 'Bloquear', 'Shift L') + '<div class="menu-sep"></div>' + item('item-del', 'Borrar', 'Supr');
    } else if (kind === 'menu-multi-filter') {
      const counts = {};
      for (const id of multi) { const t = doc.items[id].type; counts[t] = (counts[t] || 0) + 1; }
      if (multiRoots.size) counts[MAP] = multiRoots.size;
      if (multiNodes.size) counts[NODE] = multiNodes.size;
      html = Object.entries(counts).map(([t, c]) => item('multi-filter', `${TYPE_NAMES[t] || t} <span class="menu-count">${c}</span>`, '', t)).join('');
    } else if (kind === 'menu-multi-more') {
      html = (multi.size ? item('multi-dup', 'Duplicar', 'Ctrl D') + item('multi-lock', 'Bloquear', 'Shift L') : '') +
        item('multi-wrap', 'Meter en sección') + '<div class="menu-sep"></div>' + (multi.size ? item('multi-del', 'Borrar', 'Supr') : '');
    } else if (kind === 'menu-shapes' || kind === 'menu-shape-type') {
      const cur = kind === 'menu-shape-type' ? it.shape : null;
      html = `<div class="shape-grid">${Shapes.CATALOG.map(([k, label, key]) =>
        `<button class="shape-cell${cur === k ? ' on' : ''}" data-act="${kind === 'menu-shapes' ? 'shape-pick' : 'shape-type'}" data-arg="${k}" data-tip="${label}${key ? ` · ${key}` : ''}">${Shapes.thumb(k)}</button>`).join('')}</div>`;
    } else if (kind === 'menu-shape-color') {
      html = `${dots(SHAPE_COLORS, it.color, 'shape-color')}<label class="color-dot custom" data-tip="Color personalizado">+<input type="color" data-act="shape-color-custom" /></label></div>`;
    } else if (kind === 'menu-shape-style') {
      html = SHAPE_STYLES.map(([k, label]) => item('shape-style', label, '', k, (it.style || 'border') === k)).join('');
    } else if (kind === 'menu-table-new') {
      // Selector de tamaño más importar CSV.
      html = `<div class="table-pick">${[...Array(64)].map((_, i) => `<span data-r="${Math.floor(i / 8) + 1}" data-c="${(i % 8) + 1}"></span>`).join('')}</div>` +
        '<div class="table-pick-label">Elige el tamaño</div><div class="menu-sep"></div>' +
        item('table-csv', 'Importar CSV…') + item('table-demo', 'Tabla de ejemplo con gráfico') +
        '<div class="menu-hint">También puedes pegar (Ctrl+V) una tabla de Excel, Google Sheets, Word, Notion o Markdown, o arrastrar un .csv al lienzo.</div>';
    } else if (kind === 'menu-table-rows') {
      html = item('tbl-op', 'Insertar fila encima', '', 'row-above') + item('tbl-op', 'Insertar fila debajo', '', 'row-below') +
        item('tbl-op', 'Insertar columna a la izquierda', '', 'col-left') + item('tbl-op', 'Insertar columna a la derecha', '', 'col-right') +
        '<div class="menu-sep"></div>' + item('tbl-op', 'Subir fila', '', 'row-up') + item('tbl-op', 'Bajar fila', '', 'row-down') +
        item('tbl-op', 'Mover columna a la izquierda', '', 'col-left-move') + item('tbl-op', 'Mover columna a la derecha', '', 'col-right-move') +
        '<div class="menu-sep"></div>' + item('tbl-op', 'Eliminar fila', 'Ctrl Alt ⌫', 'row-del') + item('tbl-op', 'Eliminar columna', '', 'col-del') +
        (selCell ? '' : '<div class="menu-hint">Selecciona una celda para elegir qué fila o columna.</div>');
    } else if (kind === 'menu-table-color') {
      html = `${dots(SECTION_COLORS, it.color, 'tbl-color')}</div>`;
    } else if (kind === 'menu-chart-new' || kind === 'menu-chart-type') {
      const act = kind === 'menu-chart-new' ? 'chart-new' : 'chart-kind';
      html = `<div class="shape-grid" style="width:236px">${Charts.KINDS.map(([k, label]) =>
        `<button class="shape-cell${it && it.kind === k ? ' on' : ''}" data-act="${act}" data-arg="${k}" data-tip="${label}">${Charts.thumb(k)}</button>`).join('')}</div>`;
    } else if (kind === 'menu-chart-data') {
      const d = chartDataFor(it);
      const head = d.head || [];
      const mark = (on) => `<span class="mark">${on ? '✓' : ''}</span>`;
      html = '<div class="data-menu"><div class="menu-title">Etiquetas</div>' +
        head.map((h, c) => `<button class="menu-item" data-act="chart-label" data-arg="${c}">${mark(c === d.labelCol)}${esc(h || `Columna ${c + 1}`)}</button>`).join('') +
        '<div class="menu-title">Series (valores)</div>' +
        (d.numericCols || []).filter((c) => c !== d.labelCol).map((c) => `<button class="menu-item" data-act="chart-series" data-arg="${c}">${mark(d.seriesCols.includes(c))}${esc(head[c] || `Columna ${c + 1}`)}</button>`).join('') +
        (!head.length ? '<div class="menu-hint">La tabla de origen se borró: el gráfico conserva sus últimos datos.</div>' : '') +
        '<div class="menu-hint">Dispersión: 1.ª serie = X, 2.ª = Y (3.ª = tamaño en burbujas). Como mucho 8 series (3 en dispersión, burbujas y radar).</div></div>';
    } else if (kind === 'menu-conn-label') {
      html = `<input class="title-input" value="${esc(it.label || '')}" placeholder="Texto del conector" />` +
        `<div class="menu-sep"></div>${item('conn-label-bg', 'Fondo claro detrás del texto', '', '', !!it.labelBg)}`;
    } else if (kind === 'menu-conn-color') {
      html = `<div class="colors"><button class="color-dot${!it.color ? ' on' : ''}" data-act="conn-color" data-arg="" style="background:${CONN_COLOR}" data-tip="Por defecto"></button>` +
        `${Object.entries(SHAPE_COLORS).map(([k, c]) => `<button class="color-dot${it.color === k ? ' on' : ''}" data-act="conn-color" data-arg="${k}" style="background:${c}" data-tip="${k}"></button>`).join('')}</div>`;
    } else if (kind === 'menu-conn-cap') {
      const end = anchor.dataset.arg;
      html = `<div class="cap-grid">${Conn.CAPS.map(([k, label]) =>
        `<button class="cap-cell${it[end] === k ? ' on' : ''}" data-act="conn-cap" data-arg="${end}:${k}" data-tip="${label}">${capThumb(k, end === 'startCap')}</button>`).join('')}</div>`;
    } else if (kind === 'menu-conn-route') {
      html = [['elbow', 'En codo'], ['curve', 'Curvo'], ['straight', 'Recto']].map(([k, l]) => item('conn-route', `${routeIcon(k)} ${l}`, '', k, (it.route || 'elbow') === k)).join('');
    } else if (kind === 'menu-ink-color' || kind === 'menu-draw-color') {
      // El subrayador no admite los colores más claros .
      const hl = kind === 'menu-draw-color' ? inkPrefs.tool === 'highlighter' : it ? it.hl : false;
      const cur = kind === 'menu-draw-color' ? inkPrefs.color : it ? it.color : doc.items[[...selInks][0]]?.color;
      const palette = Object.fromEntries(Object.entries(INK_COLORS).filter(([k]) => !hl || !['white', 'gray'].includes(k)));
      html = `${dots(palette, cur, kind === 'menu-draw-color' ? 'draw-color' : 'ink-color')}</div>`;
    } else if (kind === 'menu-chart-title') {
      html = `<input class="title-input" value="${esc(it.title || '')}" placeholder="Título del gráfico" />`;
    } else if (kind === 'menu-section-color') {
      html = `${dots(SECTION_COLORS, it.color, 'section-color')}</div>`;
    } else if (kind === 'menu-section-more') {
      html = item('section-rename', 'Renombrar', 'Enter') + item('item-dup', 'Duplicar sección vacía') + '<div class="menu-sep"></div>' +
        item('section-del', 'Borrar sección (deja el contenido)', 'Supr') + item('section-del-all', 'Borrar sección y su contenido');
    }
    pop.innerHTML = html;
    pop.hidden = false;
    pop.dataset.kind = kind;
    const r = stageRect(), a = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const fromToolbox = !!anchor.closest && !!anchor.closest('#toolbox, #drawbox');
    let left = fromToolbox ? a.right - r.left + 10 : a.left - r.left + a.width / 2 - pw / 2;
    left = Math.max(8, Math.min(r.width - pw - 8, left));
    let top = fromToolbox ? a.top - r.top - 20 : a.bottom - r.top + 8;
    if (top + ph > r.height - 8) top = fromToolbox ? r.height - ph - 8 : a.top - r.top - ph - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;
    if (kind === 'menu-link') {
      const inp = pop.querySelector('.link-url');
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { closePopover(); restoreLinkRange(); }
        if (e.key === 'Enter') { e.preventDefault(); submitLink(inp.value); }
      });
    }
    if (kind === 'menu-media') {
      const inp = pop.querySelector('.media-url');
      inp.focus();
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') return closePopover();
        if (e.key !== 'Enter') return;
        const at = pendingImage || viewCenter();
        if (insertVideoLink(inp.value, at)) { pendingImage = null; closePopover(); } else pop.querySelector('.media-hint').hidden = false;
      });
    }
    if (kind === 'menu-conn-label') {
      const inp = pop.querySelector('.title-input');
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const v = inp.value.trim(); closePopover(); setItem(selItem, { label: v }); }
        if (e.key === 'Escape') closePopover();
      });
    }
    if (kind === 'menu-chart-title') {
      const inp = pop.querySelector('.title-input');
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const v = inp.value.trim(); closePopover(); setItem(selItem, { title: v }); }
        if (e.key === 'Escape') closePopover();
      });
    }
    if (kind === 'menu-table-new') {
      const grid = pop.querySelector('.table-pick'), label = pop.querySelector('.table-pick-label');
      grid.addEventListener('pointerover', (e) => {
        const s = e.target.closest('span');
        if (!s) return;
        const R = +s.dataset.r, C = +s.dataset.c;
        grid.querySelectorAll('span').forEach((x) => x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C));
        label.textContent = `${C} columnas × ${R} filas`;
      });
      grid.addEventListener('click', (e) => {
        const s = e.target.closest('span');
        if (!s) return;
        const at = pendingTable || viewCenter();
        pendingTable = null;
        closePopover();
        createTable(Math.max(2, +s.dataset.r), +s.dataset.c, at);
      });
    }
    const search = pop.querySelector('.icon-search');
    if (search) {
      search.focus();
      const act = kind === 'menu-icon' ? 'icon' : 'sticker';
      search.addEventListener('input', () => { pop.querySelector('.icon-results').innerHTML = iconGrid(search.value, act); });
    }
  }

  function iconGrid(q, act) {
    const term = q.trim().toLowerCase();
    return NODE_ICONS.map(([cat, list]) => {
      const hits = list.filter(([, words]) => !term || words.includes(term) || cat.toLowerCase().includes(term));
      if (!hits.length) return '';
      return `<div class="icon-cat">${cat}</div><div class="icon-grid">${hits.map(([e, words]) =>
        `<button class="icon-cell" data-act="${act}" data-arg="${e}" data-tip="${words.split(' ')[0]}">${e}</button>`).join('')}</div>`;
    }).join('') || '<div class="icon-cat">Sin resultados</div>';
  }

  function closePopover() { pop.hidden = true; pop.innerHTML = ''; pendingSticker = pendingSticker && pop.dataset.kind === 'menu-sticker' ? null : pendingSticker; }

  // ---------- Acciones de la barra y los menús ----------

  function act(name, arg, el) {
    const id = selectedId;
    switch (name) {
      case 'bold': case 'italic': case 'strike': case 'code': case 'mark': case 'link':
        closePopover(); return inlineFormat(name);
      case 'block': return setBlock(arg);
      case 'block-set': closePopover(); return setBlock(arg);
      case 'fmt': closePopover(); return inlineFormat(arg);
      case 'theme': closePopover(); return setThemePref(arg);
      case 'media-file': closePopover(); return $('#image-file').click();
      case 'link-remove': closePopover(); restoreLinkRange(); return inlineFormat('unlink');
      case 'video-loop': return setItem(selItem, { loop: !doc.items[selItem].loop });
      case 'video-open': { const it = doc.items[selItem]; const src = it.embed || it.url; if (src) window.open(src, '_blank', 'noopener'); return; }
      case 'text-align': closePopover(); return setItem(selItem, { align: arg });
      case 'layout': return setLayout(arg);
      case 'lines': return mutate(() => { mapSettings(doc, rootOf(selectedId || doc.rootId)).lines = arg; });
      case 'dash': return setStyle(id, 'dash', arg === '1' ? true : null);
      case 'color': closePopover(); return setStyle(id, 'color', arg);
      case 'icon': closePopover(); return mutate(() => { doc.nodes[id].icon = arg || null; });
      case 'collapse': return toggleCollapse(id);
      case 'duplicate': closePopover(); return duplicate(id);
      case 'copy': closePopover(); return copyBranch(false);
      case 'cut': closePopover(); return copyBranch(true);
      case 'paste': closePopover(); return pasteBranch();
      case 'delete': closePopover(); return deleteNode(id);
      case 'export-png': closePopover(); return exportImage('png');
      case 'export-svg': closePopover(); return exportImage('svg');
      case 'note-color': closePopover(); noteColor = arg; pref('mindmap:noteColor', arg); return setItem(selItem, { color: arg });
      case 'text-color': closePopover(); return setItem(selItem, { color: arg });
      case 'text-size': closePopover(); return setItem(selItem, { size: arg });
      case 'sticker': {
        const at = pendingSticker;
        pendingSticker = null;
        closePopover();
        if (at) return createItem('sticker', at, { emoji: arg });
        return selItem && setItem(selItem, { emoji: arg });
      }
      case 'shape-pick':
        closePopover();
        lastShape = arg;
        pref('mindmap:lastShape', arg);
        return setTool(`shape:${arg}`);
      case 'shape-type': closePopover(); return setItem(selItem, { shape: arg });
      case 'shape-color': case 'shape-style': {
        closePopover();
        const it = doc.items[selItem];
        const key = name === 'shape-color' ? 'color' : 'style';
        const last = JSON.parse(pref(`mindmap:shape:${it.shape}`) || '{}');
        pref(`mindmap:shape:${it.shape}`, JSON.stringify({ ...last, [key]: arg }));
        return setItem(selItem, { [key]: arg });
      }
      case 'shape-rot': {
        const it = doc.items[selItem];
        // Gira 90°: la caja intercambia ancho y alto alrededor del mismo centro.
        return setItem(selItem, { rot: ((it.rot || 0) + 90) % 360, w: it.h, h: it.w, x: Math.round(it.x + (it.w - it.h) / 2), y: Math.round(it.y + (it.h - it.w) / 2) });
      }
      case 'section-color': closePopover(); return setItem(selItem, { color: arg });
      case 'section-fill': return setItem(selItem, { fill: arg === '1' });
      case 'section-rename': closePopover(); return renameSection(selItem);
      case 'section-del': closePopover(); return deleteItem();
      case 'section-del-all': {
        closePopover();
        const { ids } = sectionContents(selItem);
        const sid = selItem;
        mutate(() => { detachConns(new Set([sid, ...ids])); for (const x of [sid, ...ids]) { if (doc.items[x]?.type === 'table') detachCharts(x); } for (const x of [sid, ...ids]) delete doc.items[x]; });
        selItem = null;
        return render();
      }
      case 'wrap-section': closePopover(); return wrapInSection();
      case 'item-lock': closePopover(); return lockSel(true);
      case 'item-unlock': return lockSel(false);
      case 'multi-lock': closePopover(); return lockSel(true);
      case 'multi-dup': closePopover(); return duplicateMulti();
      case 'multi-del': closePopover(); return deleteMulti();
      case 'multi-align': closePopover(); return alignMulti(arg);
      case 'multi-arrange': closePopover(); return arrangeMulti(arg);
      case 'multi-front': { let z = topZ(); return mutate(() => { for (const i of multi) if (!['section', 'conn'].includes(doc.items[i].type)) Object.assign(doc.items[i], { z: z++, back: false }); }); }
      case 'multi-bottom': { let z = bottomZ() - multi.size; return mutate(() => { for (const i of multi) if (!['section', 'conn'].includes(doc.items[i].type)) Object.assign(doc.items[i], { z: z++, back: false }); }); }
      case 'item-bottom': closePopover(); return setItem(selItem, { back: false, z: bottomZ() });
      case 'snap-grid': closePopover(); return snapToGrid();
      case 'style-copy': closePopover(); return copyStyle();
      case 'style-paste': closePopover(); return pasteStyle();
      case 'style-default': closePopover(); return saveDefaultStyle();
      case 'copy-link': closePopover(); return copyLink();
      case 'conn-reset': closePopover(); return setItem(selItem, { chans: null, mid: null });
      case 'select-all': return setMulti(Object.values(doc.items).filter((i) => !i.locked).map((i) => i.id), rootIdsOf(doc));
      case 'ctx-add-child': return addChild(selectedId);
      case 'ctx-add-sibling': return addSibling(selectedId);
      case 'ctx-place': return placeTool(arg, ctxPoint || here());
      case 'ctx-fit': return fit();
      case 'ctx-zoom100': return zoomTo(1);
      case 'multi-wrap': { closePopover(); const r = multiBounds(); clearSelection(); return wrapInSection(r); }
      case 'multi-filter': {
        closePopover();
        if (arg === MAP) return setMulti([], [...multiRoots]);
        if (arg === NODE) return setMulti([], [], [...multiNodes]);
        return setMulti([...multi].filter((id) => doc.items[id].type === arg), []);
      }
      // Conectores
      case 'conn-color': closePopover(); return setItem(selItem, { color: arg || null });
      case 'conn-style': return setItem(selItem, { style: arg });
      case 'conn-cap': { closePopover(); const [end, k] = arg.split(':'); return setItem(selItem, { [end]: k }); }
      case 'conn-swap': { const c = doc.items[selItem]; return setItem(selItem, { from: c.to, to: c.from, startCap: c.endCap, endCap: c.startCap, labelT: 1 - (c.labelT ?? 0.5), chans: Array.isArray(c.chans) ? [...c.chans].reverse() : null }); }
      case 'conn-route': closePopover(); return setItem(selItem, { route: arg, mid: null, chans: null });
      case 'conn-label-bg': closePopover(); return setItem(selItem, { labelBg: !doc.items[selItem].labelBg });
      // Trazos
      case 'ink-color': {
        closePopover();
        const ids = selItem ? [selItem] : [...selInks];
        return mutate(() => { for (const id of ids) doc.items[id].color = arg; });
      }
      case 'ink-width': {
        const ids = selItem ? [selItem] : [...selInks];
        return mutate(() => { for (const id of ids) { const i = doc.items[id]; i.width = inkWidth(i.hl, arg === '1'); } });
      }
      case 'ink-del': {
        const ids = [...selInks];
        selInks.clear();
        return mutate(() => { for (const id of ids) delete doc.items[id]; });
      }
      case 'draw-color': closePopover(); inkPrefs.color = arg; saveInkPrefs(); return syncDrawbox();
      // Tablas
      case 'table-csv': closePopover(); return $('#csv-file').click();
      case 'table-demo': {
        closePopover();
        pendingTable = null;
        // Debajo de todo lo que ya hay, para no tapar el mapa.
        const cb = contentBounds();
        const at = { x: cb.x + 280, y: cb.y + cb.h + 220 };
        const id = createTableFromRows([['Mes', 'Ventas', 'Gastos', 'Margen'], ['Enero', '12.400', '8.100', '4.300'], ['Febrero', '13.900', '8.600', '5.300'],
          ['Marzo', '15.200', '9.400', '5.800'], ['Abril', '14.100', '9.000', '5.100'], ['Mayo', '17.800', '10.200', '7.600'], ['Junio', '19.300', '11.000', '8.300']], at);
        return createChart(id, 'column');
      }
      case 'tbl-op': closePopover(); if (editing) commitEdit(); return tableOp(arg);
      case 'tbl-sort': if (editing) commitEdit(); return tableOp('sort', arg);
      case 'tbl-header': return setItem(selItem, { header: doc.items[selItem].header === false });
      case 'tbl-striped': return setItem(selItem, { striped: !doc.items[selItem].striped });
      case 'tbl-color': closePopover(); return setItem(selItem, { color: arg });
      case 'tbl-csv': return exportCSV();
      // Gráficos
      case 'chart-new': { closePopover(); if (editing) commitEdit(); return createChart(selItem, arg); }
      case 'chart-kind': closePopover(); return setItem(selItem, { kind: arg });
      case 'chart-label': case 'chart-series': {
        const it = doc.items[selItem];
        const d = chartDataFor(it);
        const c = +arg;
        if (name === 'chart-label') setItem(selItem, { labelCol: c, seriesCols: d.seriesCols.filter((x) => x !== c) });
        else {
          const has = d.seriesCols.includes(c);
          const next = has ? d.seriesCols.filter((x) => x !== c) : [...d.seriesCols, c].sort((a, b) => a - b);
          if (next.length) setItem(selItem, { seriesCols: next });
        }
        return openPopover('menu-chart-data', bar.querySelector('[data-act="menu-chart-data"]') || bar);
      }
      case 'chart-values': return setItem(selItem, { showValues: !doc.items[selItem].showValues });
      case 'chart-goto': {
        const t = doc.items[selItem].tableId;
        selectItem(t);
        return ensureVisibleRect(itemRect(t));
      }
      case 'item-dup': closePopover(); return duplicateItem();
      case 'item-del': closePopover(); return deleteItem();
      case 'item-front': closePopover(); return setItem(selItem, { back: false, z: topZ() });
      case 'item-back': closePopover(); return setItem(selItem, { back: true });
      case 'item-download': {
        const it = doc.items[selItem];
        if (it && it.type === 'video' && it.mediaId) { Store.media.get(it.mediaId).then((m) => { if (m) download(m.name || 'video.mp4', m.blob); }); return; }
        if (it && it.src) download(`imagen.${it.src.slice(11, it.src.indexOf(';')) || 'png'}`, dataUrlToBlob(it.src));
        return;
      }
      default:
        if (name.startsWith('menu-')) {
          if (!pop.hidden && pop.dataset.kind === name) return closePopover();
          return openPopover(name, el);
        }
    }
  }

  for (const host of [bar, pop]) {
    // No robar el foco al editor de texto al pulsar botones.
    host.addEventListener('pointerdown', (e) => { if (!e.target.closest('input')) e.preventDefault(); e.stopPropagation(); });
    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && b.tagName !== 'INPUT') act(b.dataset.act, b.dataset.arg, b);
    });
  }
  pop.addEventListener('input', (e) => {
    if (e.target.dataset.act === 'color-custom') setStyle(selectedId, 'color', e.target.value);
    if (e.target.dataset.act === 'shape-color-custom') setItem(selItem, { color: e.target.value });
  });


  // ---------- Menú del clic derecho ----------

  const ctx = $('#ctxmenu');
  let ctxPoint = null;
  const cItem = (act, icon, label, k = '', arg = '', disabled = false) =>
    `<button class="ctx-item" data-act="${act}" data-arg="${arg}"${disabled ? ' disabled' : ''}>${icon || '<span class="ctx-noicon"></span>'}<span class="ctx-label">${label}</span>${keys(k)}</button>`;
  const cSub = (icon, label, inner) => `<div class="ctx-sub"><button class="ctx-item" tabindex="-1">${icon}<span class="ctx-label">${label}</span>` +
    `<span class="ctx-chev">${UI.chevron}</span></button><div class="ctx-menu ctx-submenu">${inner}</div></div>`;
  const cSep = '<div class="menu-sep"></div>';

  function ctxHtml() {
    const it = selItem && doc.items[selItem];
    const canStyle = styleTargets().length > 0;
    const alignSub = cSub(UI.alignLeft, 'Alinear',
      cItem('multi-align', UI.alignLeft, 'A la izquierda', '', 'left') + cItem('multi-align', UI.alignCenter, 'Al centro', '', 'center') + cItem('multi-align', UI.alignRight, 'A la derecha', '', 'right') + cSep +
      cItem('multi-align', UI.alignTop, 'Arriba', '', 'top') + cItem('multi-align', UI.alignMiddle, 'En medio', '', 'middle') + cItem('multi-align', UI.alignBottom, 'Abajo', '', 'bottom') + cSep +
      cItem('multi-align', UI.distH, 'Repartir en horizontal', '', 'dist-h') + cItem('multi-align', UI.distV, 'Repartir en vertical', '', 'dist-v'));
    if (multiCount() > 1) {
      const movable = arrangeable();
      const solid = [...multi].filter((id) => doc.items[id].type !== 'conn').length + multiRoots.size;
      const organize = cItem('multi-front', UI.front, 'Traer al frente') + cItem('multi-bottom', UI.back, 'Enviar al fondo') +
        (movable.length >= 2 ? cSep + cItem('multi-arrange', UI.arrangeGrid, 'En cuadrícula', '', 'grid') +
          (linksAmong(movable).length ? cItem('multi-arrange', UI.arrangeTree, 'Como árbol', '', 'tree') + cItem('multi-arrange', UI.arrangeMind, 'Como mapa mental', '', 'mind') : '') : '');
      return (multi.size ? cItem('copy', UI.copy, 'Copiar', 'Ctrl C') + cItem('cut', UI.cut, 'Cortar', 'Ctrl X') + cItem('multi-dup', UI.duplicate, 'Duplicar', 'Ctrl D') + cItem('multi-del', UI.trash, 'Borrar', 'Supr') + cSep
        : multiNodes.size ? cItem('multi-del', UI.trash, multiNodes.size === 1 ? 'Borrar el nodo' : `Borrar ${multiNodes.size} nodos`, 'Supr') + cSep : '') +
        cItem('style-paste', UI.brush, 'Pegar estilo', 'Ctrl Alt V', '', !canStyle) + cSep +
        cSub(UI.front, 'Organizar', organize) + (solid >= 2 ? alignSub : '') + cSep +
        (multi.size ? cItem('multi-lock', UI.lock, 'Bloquear', 'Shift L') + cSep : '') +
        cItem('multi-wrap', UI.section, 'Meter en sección') + cSep +
        cItem('snap-grid', UI.snap, 'Ajustar a la cuadrícula') + cItem('copy-link', UI.link, 'Copiar enlace a esta posición');
    }
    if (it && it.locked) {
      return cItem('item-unlock', UI.lock, 'Desbloquear', 'Shift L') + cSep + cItem('copy', UI.copy, 'Copiar', 'Ctrl C') + cItem('copy-link', UI.link, 'Copiar enlace a esta posición');
    }
    if (it) {
      let h = cItem('copy', UI.copy, 'Copiar', 'Ctrl C') + cItem('cut', UI.cut, 'Cortar', 'Ctrl X') + cItem('item-dup', UI.duplicate, 'Duplicar', 'Ctrl D') + cItem('item-del', UI.trash, 'Borrar', 'Supr');
      if (it.type === 'conn') h += cSep + cItem('conn-swap', UI.swap, 'Invertir dirección') + (Array.isArray(it.chans) ? cItem('conn-reset', UI.elbow, 'Volver a la ruta automática') : '');
      if (STYLE_KEYS[it.type]) {
        h += cSep + cItem('style-copy', UI.copy, 'Copiar estilo', 'Ctrl Alt C') + cItem('style-paste', UI.brush, 'Pegar estilo', 'Ctrl Alt V', '', !canStyle) +
          (['shape', 'note', 'text', 'conn'].includes(it.type) ? cItem('style-default', UI.bookmark, 'Guardar como estilo por defecto') : '');
      }
      if (it.type !== 'conn') {
        h += cSep + cSub(UI.front, 'Organizar', cItem('item-front', UI.front, 'Traer al frente') + cItem('item-bottom', UI.back, 'Enviar al fondo') +
          (it.type !== 'section' ? cItem('item-back', UI.back, 'Enviar detrás del mapa') : ''));
      }
      h += cSep + cItem('item-lock', UI.lock, 'Bloquear', 'Shift L');
      if (it.type !== 'conn') h += cSep + cItem('wrap-section', UI.section, 'Meter en sección') + cSep + cItem('snap-grid', UI.snap, 'Ajustar a la cuadrícula');
      return h + cItem('copy-link', UI.link, 'Copiar enlace a esta posición');
    }
    if (selectedId) {
      const root = selectedId === doc.rootId;
      const b = layout.boxes[selectedId];
      return cItem('copy', UI.copy, 'Copiar', 'Ctrl C') + (root ? '' : cItem('cut', UI.cut, 'Cortar', 'Ctrl X')) + cItem('paste', UI.paste, 'Pegar como hijo', 'Ctrl V', '', !clipboard) +
        (root ? '' : cItem('duplicate', UI.duplicate, 'Duplicar', 'Ctrl D') + cItem('delete', UI.trash, 'Borrar', 'Supr')) + cSep +
        cItem('ctx-add-child', UI.plus, 'Añadir hijo', 'Tab') + (root ? '' : cItem('ctx-add-sibling', UI.plus, 'Añadir hermano')) +
        (b && b.children.length ? cItem('collapse', UI.collapse, b.collapsed ? 'Desplegar' : 'Plegar', 'Ctrl /') : '') + cSep +
        cItem('wrap-section', UI.section, 'Meter el mapa en una sección') + cItem('export-png', UI.download, 'Exportar mapa como PNG') + cItem('copy-link', UI.link, 'Copiar enlace a esta posición');
    }
    return cItem('paste', UI.paste, 'Pegar aquí', 'Ctrl V', '', !clipboard) + cItem('select-all', UI.cursor, 'Seleccionar todo', 'Ctrl A') + cSep +
      cItem('ctx-place', UI.map, 'Mapa mental', 'M', 'mindmap') + cItem('ctx-place', UI.note, 'Nota', 'N', 'note') + cItem('ctx-place', UI.shape, 'Forma', 'R', 'shape:rect') + cItem('ctx-place', UI.text, 'Texto', 'T', 'text') +
      cItem('ctx-place', UI.sticker, 'Sticker', 'X', 'sticker') + cItem('ctx-place', UI.image, 'Imagen o vídeo', 'I', 'image') + cItem('ctx-place', UI.table, 'Tabla', 'E', 'table') + cItem('ctx-place', UI.section, 'Sección', '.', 'section') + cSep +
      cItem('ctx-fit', UI.fit, 'Ver todo', '1') + cItem('ctx-zoom100', UI.size, 'Zoom al 100 %', '0') + cItem('copy-link', UI.link, 'Copiar enlace a esta posición');
  }

  function closeCtx() { ctx.hidden = true; ctx.innerHTML = ''; }

  stage.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#contextbar, #popover, #zoombar, #toolbox, #drawbox')) return;
    if (editing) return; // dentro del texto que se edita, el menú del navegador (corrector, pegar…)
    e.preventDefault();
    hideTip();
    closePopover();
    const w0 = toWorld(e.clientX, e.clientY);
    ctxPoint = w0;
    mouseWorld = w0;
    const el = e.target.closest('.mm-item, .mm-section, [data-conn], [data-clabel], [data-cseg], .mm-node');
    const gid = el ? (el.classList.contains('mm-node') ? nodeGid(el.dataset.id) : el.dataset.item || el.dataset.conn || el.dataset.clabel || (el.dataset.cseg != null ? selItem : null)) : null;
    if (gid && multiCount() > 1 && inSel(gid)) { /* se mantiene la selección de varios */ }
    else if (tokRoot(gid) || tokNode(gid)) selectNode(el.dataset.id, false);
    else if (gid) { if (selItem !== gid) selectItem(gid); }
    else if (selectedId || selItem || multiCount()) clearSelection();
    ctx.innerHTML = ctxHtml();
    ctx.hidden = false;
    ctx.classList.toggle('flip', e.clientX + ctx.offsetWidth + 240 > innerWidth);
    ctx.style.left = `${Math.min(e.clientX, innerWidth - ctx.offsetWidth - 8)}px`;
    ctx.style.top = `${Math.max(8, Math.min(e.clientY, innerHeight - ctx.offsetHeight - 8))}px`;
  });
  ctx.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  ctx.addEventListener('contextmenu', (e) => e.preventDefault());
  ctx.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    closeCtx();
    if (ctxPoint) mouseWorld = ctxPoint;
    act(b.dataset.act, b.dataset.arg, b);
  });
  document.addEventListener('pointerdown', (e) => { if (!ctx.hidden && !e.target.closest('#ctxmenu')) closeCtx(); }, true);
  stage.addEventListener('wheel', () => { if (!ctx.hidden) closeCtx(); }, { passive: true });
  window.addEventListener('blur', () => { if (!ctx.hidden) closeCtx(); });

  // ---------- Copiar, cortar y pegar ----------

  const outline = (d, id, depth = 0) => [`${'\t'.repeat(depth)}${plainText(d.nodes[id]).replace(/\n/g, ' ')}`,
    ...kidsOf(d, id).map((c) => outline(d, c.id, depth + 1))].join('\n');

  function copyBranch(cut, e) {
    if (multi.size) {
      clipboard = { group: [...multi].map((id) => JSON.parse(JSON.stringify(doc.items[id]))), text: '' };
      if (e) e.clipboardData.setData('text/plain', ' ');
      if (cut) deleteMulti();
      return;
    }
    if (selItem) {
      const it = doc.items[selItem];
      clipboard = { item: JSON.parse(JSON.stringify(it)), text: it.lines ? it.lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n') : '' };
      if (e) e.clipboardData.setData('text/plain', clipboard.text || ' ');
      if (cut) deleteItem();
      return;
    }
    if (!selectedId) return;
    clipboard = cloneSubtree(doc, selectedId);
    clipboard.text = outline(doc, selectedId);
    if (e) e.clipboardData.setData('text/plain', clipboard.text);
    else if (navigator.clipboard) navigator.clipboard.writeText(clipboard.text).catch(() => {});
    if (cut && selectedId !== doc.rootId) deleteNode(selectedId);
  }

  // Pega como hijo del nodo seleccionado: la rama copiada o un esquema de texto (sangría = nivel).
  function pasteBranch(text) {
    let clip = clipboard;
    if (text != null && (!clip || (clip.text || '').trim() !== text.replace(/\r/g, '').trim())) clip = outlineToClip(text);
    if (!clip) return;
    if (clip.group) {
      // Se pega donde está el cursor, conservando la colocación relativa.
      const box = unionRect(clip.group.filter((it) => it.type !== 'conn').map((it) => ({ x: it.x, y: it.y, w: it.w || 0, h: it.h || 0 })));
      const at = here();
      const dx = box ? Math.round(at.x - box.x) : 24, dy = box ? Math.round(at.y - box.y) : 24;
      const ids = mutate(() => cloneItems(clip.group, dx, dy));
      return setMulti(ids, false);
    }
    if (clip.item) {
      const nid = uid();
      const at = here();
      mutate(() => { doc.items[nid] = { ...JSON.parse(JSON.stringify(clip.item)), id: nid, x: Math.round(at.x), y: Math.round(at.y), z: topZ() }; });
      return selectItem(nid);
    }
    const parentId = selectedId || doc.rootId;
    const ks = children(parentId);
    const nid = mutate(() => {
      delete doc.nodes[parentId].style.collapsed;
      return insertClone(clip, parentId, ks.length ? ks[ks.length - 1].order + 1 : 1);
    });
    selectNode(nid);
  }

  function outlineToClip(text) {
    const rows = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    if (!rows.length) return null;
    const nodes = [];
    const rootId = uid();
    const many = rows.length > 1 && rows.every((r) => /^\s/.test(r) === /^\s/.test(rows[0]));
    const top = makeNode(rootId, null, 1, many ? 'Pegado' : rows[0].trim());
    nodes.push(top);
    const body = many ? rows : rows.slice(1);
    const stack = [{ depth: -1, id: rootId }];
    let order = 1;
    for (const row of body) {
      const depth = row.match(/^\s*/)[0].replace(/ {2}/g, '\t').length;
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      const id = uid();
      nodes.push(makeNode(id, stack[stack.length - 1].id, order++, row.trim().replace(/^[-*•]\s+/, '')));
      stack.push({ depth, id });
    }
    return { rootId, nodes };
  }

  // Copiar y pegar van al lienzo salvo que se esté escribiendo en un campo (título del mapa, buscadores, enlaces…).
  // Antes dependía de que el foco estuviera en el lienzo, y tras pulsar un botón el pegado se perdía.
  const typingIn = (el) => !!el && (el.matches('input, textarea, select') || el.isContentEditable);
  const isCanvasFocus = () => !typingIn(document.activeElement) && help.hidden && about.hidden;

  document.addEventListener('copy', (e) => { if (!editing && isCanvasFocus() && !String(getSelection())) { e.preventDefault(); copyBranch(false, e); } });
  document.addEventListener('cut', (e) => { if (!editing && isCanvasFocus() && !String(getSelection())) { e.preventDefault(); copyBranch(true, e); } });
  document.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    // Capturas de pantalla e imágenes copiadas: a veces llegan como «items» y no como «files».
    let files = [...(cd.files || [])].filter(isMedia);
    if (!files.length) files = [...(cd.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f) => f && isMedia(f));
    if (editing) {
      e.preventDefault();
      document.execCommand('insertText', false, cd.getData('text/plain').replace(/\r?\n/g, ' '));
      return;
    }
    if (!help.hidden || !about.hidden) return;
    // En un campo de texto se pega texto con normalidad; una imagen o un vídeo van al lienzo.
    if (typingIn(document.activeElement) && !files.length) return;
    e.preventDefault();
    if (files.length) {
      const at = !pop.hidden && pop.dataset.kind === 'menu-media' && pendingImage ? pendingImage : here();
      closePopover();
      pendingImage = null;
      return addImages(files, at);
    }
    const text = cd.getData('text/plain');
    const html = cd.getData('text/html');
    if (!/\s/.test(text.trim()) && insertVideoLink(text, here())) return;
    // Con una celda seleccionada, el texto va a esa celda.
    if (selItem && doc.items[selItem]?.type === 'table' && selCell && !/\t|\n/.test(text.trim())) {
      startCellEdit(selItem, selCell.r, selCell.c, { replace: text.trim() });
      return onEditorInput();
    }
    // Tablas de Excel, Google Sheets, Word, Notion, Markdown o CSV → tabla editable.
    const tbl = Tables.parse(text, html && /<table/i.test(html) ? html : null);
    if (tbl && !(clipboard && (clipboard.text || '').trim() === text.replace(/\r/g, '').trim())) return createTableFromRows(tbl.rows, here(), tbl);
    pasteBranch(text);
  });

  // ---------- Ratón ----------

  stage.addEventListener('pointerover', (e) => {
    if (drag) return;
    const n = e.target.closest && e.target.closest('.mm-node');
    const it = e.target.closest && e.target.closest('.mm-item');
    const nid = n ? n.dataset.id : null, iid = it ? it.dataset.item : null;
    if (nid !== hoverId || iid !== hoverItem) { hoverId = nid; hoverItem = iid; render(); }
  });

  stage.addEventListener('pointerdown', (e) => {
    hideTip();
    if (e.target.closest('#contextbar, #popover, #zoombar, #toolbox, #drawbox')) return;
    closePopover();
    const world0 = toWorld(e.clientX, e.clientY);
    const panMode = e.button === 1 || spaceDown || tool === 'hand';
    const startPan = () => {
      stage.setPointerCapture(e.pointerId);
      drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      e.preventDefault();
    };
    if (panMode) return startPan();

    // Modo dibujo: rotulador, subrayador, goma o lazo sobre todo el lienzo.
    if (tool === 'draw' && e.button === 0) {
      if (editing) commitEdit();
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      const t = inkPrefs.tool;
      if (t === 'lasso' && e.target.closest('[data-inksel]')) {
        drag = { kind: 'inksel-move', sx: e.clientX, sy: e.clientY, before: snapshot(), start: [...selInks].map((id) => [id, doc.items[id].x, doc.items[id].y]) };
        return;
      }
      selItem = null;
      selectedId = null;
      if (t === 'pen' || t === 'highlighter') {
        const hl = t === 'highlighter';
        drag = { kind: 'ink', pts: [[world0.x, world0.y]], hl, width: inkWidth(hl, inkPrefs.thick) };
      } else if (t === 'eraser') {
        drag = { kind: 'erase', before: snapshot(), at: world0, removed: 0 };
        eraseAt(world0);
      } else {
        selInks.clear();
        drag = { kind: 'lasso', poly: [[world0.x, world0.y]] };
      }
      return render();
    }

    // Conector: se arrastra desde un objeto (o un punto libre) hasta otro.
    if (tool === 'conn' && e.button === 0) {
      if (editing) commitEdit();
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      const t = targetAt(world0);
      drag = { kind: 'newconn', from: t ? { ref: t.ref, side: 'auto' } : { x: Math.round(world0.x), y: Math.round(world0.y) }, sx: e.clientX, sy: e.clientY, cur: null, hover: null };
      return;
    }

    // Herramienta de colocar activa: el clic crea el objeto.
    if (isPlacing(tool) && e.button === 0 && !e.target.closest('.mm-item, .mm-node')) {
      e.preventDefault();
      return placeTool(tool, world0);
    }

    const hot = e.target.closest('#ui-layer .hot');
    if (hot && e.button === 0) {
      e.preventDefault();
      if (hot.dataset.toggle) return toggleCollapse(hot.dataset.toggle);
      if (hot.dataset.qa === 'child') return addChild(selectedId, hot.dataset.side || null);
      if (hot.dataset.qa === 'sibling') return addSibling(selectedId);
      if (hot.dataset.qa === 'note') return addNoteNext(hot.dataset.dir);
      if (hot.dataset.qa === 'tbl-col') { if (editing) commitEdit(); return tableOp('col-end'); }
      if (hot.dataset.qa === 'tbl-row') { if (editing) commitEdit(); return tableOp('row-end'); }
      if (hot.dataset.qa === 'shape') {
        // Clic: forma nueva conectada. Arrastrar: conector que sale de ese lado.
        stage.setPointerCapture(e.pointerId);
        drag = { kind: 'qa-shape', dir: hot.dataset.dir, from: { ref: selItem, side: DIR_SIDE[hot.dataset.dir] }, sx: e.clientX, sy: e.clientY };
        return;
      }
      if (hot.dataset.mscale) {
        stage.setPointerCapture(e.pointerId);
        const box = multiBounds(), c = hot.dataset.mscale;
        drag = { kind: 'multi-scale', box, dirX: c.includes('w') ? -1 : 1, dirY: c.includes('n') ? -1 : 1,
          ax: c.includes('w') ? box.x + box.w : box.x, ay: c.includes('n') ? box.y + box.h : box.y, before: snapshot(), orig: scaleOrig() };
        return;
      }
      if (hot.dataset.cend) {
        const c = doc.items[selItem];
        const end = hot.dataset.cend;
        // Ctrl+clic en un extremo: salta al otro extremo del conector.
        if ((e.ctrlKey || e.metaKey) && c[end === 'from' ? 'to' : 'from'].ref) {
          const other = c[end === 'from' ? 'to' : 'from'].ref;
          if (other.startsWith('node:')) selectNode(other.slice(5)); else { selectItem(other); ensureVisibleRect(itemRect(other)); }
          return;
        }
        stage.setPointerCapture(e.pointerId);
        drag = { kind: 'conn-end', id: selItem, end, before: snapshot(), hover: null };
        return;
      }
      if (hot.dataset.cseg) {
        stage.setPointerCapture(e.pointerId);
        const g = connGeom(doc.items[selItem]);
        const seg = Conn.dragSegment(g.samples, +hot.dataset.cseg);
        drag = { kind: 'conn-seg', id: selItem, ...seg, before: snapshot() };
        return;
      }
      if (hot.dataset.inksel) {
        stage.setPointerCapture(e.pointerId);
        drag = { kind: 'inksel-move', sx: e.clientX, sy: e.clientY, before: snapshot(), start: [...selInks].map((id) => [id, doc.items[id].x, doc.items[id].y]) };
        return;
      }
    }

    // Varios elementos: Shift+clic añade o quita uno; arrastrar cualquiera de los elegidos los mueve todos.
    if (e.button === 0) {
      const el = e.target.closest('.mm-item, .mm-section, [data-conn], [data-clabel], .mm-node');
      const gid = el && (el.classList.contains('mm-node') ? nodeGid(el.dataset.id) : el.dataset.item || el.dataset.conn || el.dataset.clabel);
      // Nodos sueltos seleccionados: arrastrar uno es arrastrar esa rama (no se mueven como objetos libres).
      const looseNode = tokNode(gid) && !multiRoots.has(rootOf(tokNode(gid)));
      if (gid && e.shiftKey && !(editing && editing.id === gid)) { e.preventDefault(); return toggleInSelection(gid); }
      if (gid && multiCount() > 1 && inSel(gid) && !looseNode) {
        if (editing) commitEdit();
        e.preventDefault();
        stage.setPointerCapture(e.pointerId);
        drag = { kind: 'multi-move', sx: e.clientX, sy: e.clientY, before: snapshot(), ms: moveSet(currentSel()), gid, nodeId: el.classList.contains('mm-node') ? el.dataset.id : null };
        return;
      }
    }

    // Conectores: clic en la línea o en su texto para seleccionarlo; arrastrar el texto lo desliza.
    const labelEl = e.target.closest('[data-clabel]');
    const connEl = e.target.closest('[data-conn]');
    if ((labelEl || connEl) && e.button === 0) {
      const id = (labelEl || connEl).dataset.clabel || (labelEl || connEl).dataset.conn;
      if (editing) commitEdit();
      selInks.clear();
      selectItem(id);
      stage.setPointerCapture(e.pointerId);
      const c = doc.items[id];
      if (labelEl) drag = { kind: 'conn-label', id, before: snapshot() };
      else if (!c.from.ref && !c.to.ref) drag = { kind: 'conn-move', id, sx: e.clientX, sy: e.clientY, before: snapshot(), from: { ...c.from }, to: { ...c.to } };
      e.preventDefault();
      return;
    }

    // Sección: se coge por el título o el borde, y arrastra todo lo que tiene dentro.
    const secEl = e.target.closest('.mm-section');
    if (secEl && e.button === 0) {
      const id = secEl.dataset.item;
      if (editing) commitEdit();
      const wasSelected = selItem === id;
      if (!wasSelected) selectItem(id);
      stage.setPointerCapture(e.pointerId);
      const it = doc.items[id];
      const before = snapshot();
      if (e.target.closest('.rz')) {
        drag = { kind: 'resize', id, sx: e.clientX, sy: e.clientY, before, start: { ...it } };
      } else {
        const inside = sectionContents(id);
        drag = {
          kind: 'section', id, sx: e.clientX, sy: e.clientY, before, ox: it.x, oy: it.y,
          inside: inside.ids.filter((x) => !doc.items[x].locked).map((x) => [x, doc.items[x].x, doc.items[x].y]),
          maps: inside.roots.map((r) => [r, { ...mapSettings(doc, r).origin }]),
          clickRename: wasSelected && !!e.target.closest('.sec-title'),
        };
      }
      e.preventDefault();
      return render();
    }

    const itemEl = e.target.closest('.mm-item');
    // Tablas: clic en una celda la selecciona (otro clic la edita); el borde de la columna cambia su ancho.
    if (itemEl && e.button === 0 && doc.items[itemEl.dataset.item]?.type === 'table') {
      const id = itemEl.dataset.item;
      const td = e.target.closest('td');
      if (editing && editing.kind === 'cell' && editing.id === id && td && +td.dataset.r === editing.r && +td.dataset.c === editing.c) return;
      if (editing) commitEdit();
      const wasSelected = selItem === id;
      if (!wasSelected) selectItem(id);
      stage.setPointerCapture(e.pointerId);
      const it = doc.items[id];
      const before = snapshot();
      const rz = e.target.closest('.col-rz');
      if (rz) {
        const c = +rz.dataset.col;
        drag = { kind: 'colrz', id, c, sx: e.clientX, start: it.cols[c], before };
      } else {
        const cell = td ? { r: +td.dataset.r, c: +td.dataset.c } : null;
        drag = { kind: 'item', id, sx: e.clientX, sy: e.clientY, before, ox: it.x, oy: it.y, cell,
          cellWasSel: !!(cell && wasSelected && selCell && selCell.r === cell.r && selCell.c === cell.c), point: { x: e.clientX, y: e.clientY } };
      }
      e.preventDefault();
      return render();
    }
    if (itemEl && e.button === 0) {
      const id = itemEl.dataset.item;
      if (editing && editing.kind === 'item' && editing.id === id) return; // clic dentro del texto que se edita
      const it = doc.items[id];
      const cln = e.target.closest('.ln');
      if (cln && cln.classList.contains('b-check') && e.target === cln && e.offsetX < cln.offsetHeight * 0.9 && !it.locked) {
        e.preventDefault();
        const idx = [...cln.parentNode.children].indexOf(cln);
        return mutate(() => { it.checked[idx] = !it.checked[idx]; });
      }
      const wasSelected = selItem === id;
      if (!wasSelected) selectItem(id); else if (editing) commitEdit();
      stage.setPointerCapture(e.pointerId);
      const before = snapshot();
      if (e.target.closest('.rz')) {
        drag = { kind: 'resize', id, sx: e.clientX, sy: e.clientY, before, start: { ...it, ow: itemEls.get(id).el.offsetWidth, oh: itemEls.get(id).el.offsetHeight } };
      } else {
        drag = { kind: 'item', id, sx: e.clientX, sy: e.clientY, before, ox: it.x, oy: it.y, clickEdit: wasSelected, point: { x: e.clientX, y: e.clientY } };
      }
      e.preventDefault();
      return render();
    }

    const nodeEl = e.target.closest('.mm-node');
    const id = nodeEl && nodeEl.dataset.id;
    if (editing && editing.kind === 'node' && id === editing.id) return;
    if (editing) commitEdit();
    if (id && e.button === 0) {
      const ln = e.target.closest('.ln');
      const n = doc.nodes[id];
      if (ln && ln.classList.contains('b-check') && e.target === ln && e.offsetX < ln.offsetHeight * 0.9) {
        e.preventDefault();
        return mutate(() => { n.checked[[...ln.parentNode.children].indexOf(ln)] = !n.checked[[...ln.parentNode.children].indexOf(ln)]; });
      }
      const link = e.target.closest('a');
      if (link) { e.preventDefault(); window.open(link.href, '_blank', 'noopener'); return; }
      const wasSelected = selectedId === id;
      selectedId = id;
      selItem = null;
      render();
      stage.setPointerCapture(e.pointerId);
      const point = { x: e.clientX, y: e.clientY };
      // Arrastrar la raíz mueve el mapa entero .
      if (isRoot(id)) { const o = mapSettings(doc, id).origin; drag = { kind: 'map', root: id, sx: e.clientX, sy: e.clientY, before: snapshot(), ox: o.x, oy: o.y, clickEdit: wasSelected, point }; }
      else drag = { id, sx: e.clientX, sy: e.clientY, world: world0, active: false, clickEdit: wasSelected, point };
      e.preventDefault();
      return;
    }
    // Fondo: arrastrar dibuja el recuadro de selección (para desplazar la vista: Espacio, botón central, mano o rueda).
    if (e.button === 0) {
      const keep = e.shiftKey ? currentSel() : null;
      if (!e.shiftKey && (selectedId || selItem || multiCount() || selInks.size)) { selInks.clear(); clearSelection(); }
      stage.setPointerCapture(e.pointerId);
      drag = { kind: 'marquee', sx: e.clientX, sy: e.clientY, x0: world0.x, y0: world0.y, keep };
      e.preventDefault();
    }
  });

  let rafPending = false;
  stage.addEventListener('pointermove', (e) => {
    mouseWorld = toWorld(e.clientX, e.clientY);
    if (!drag) {
      if (!(e.target.closest && e.target.closest('[data-tip]'))) hideTip();
      const hit = e.target.closest && e.target.closest('.chart-hit');
      if (hit) showChartTip(hit, e); else chartTip.hidden = true;
      return;
    }
    chartTip.hidden = true;
    const w = mouseWorld;
    switch (drag.kind) {
      case 'ink': {
        const last = drag.pts[drag.pts.length - 1];
        if (Math.hypot(w.x - last[0], w.y - last[1]) * view.k >= 1.5) drag.pts.push([w.x, w.y]);
        return drawUI();
      }
      case 'erase': drag.at = w; eraseAt(w); return drawUI();
      case 'lasso': drag.poly.push([w.x, w.y]); return drawUI();
      case 'inksel-move': {
        drag.moving = true;
        const ddx = Math.round((e.clientX - drag.sx) / view.k), ddy = Math.round((e.clientY - drag.sy) / view.k);
        for (const [id, x, y] of drag.start) { doc.items[id].x = x + ddx; doc.items[id].y = y + ddy; }
        bar.hidden = true;
        renderItems();
        return drawUI();
      }
      case 'qa-shape':
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        drag = { kind: 'newconn', from: drag.from, sx: drag.sx, sy: drag.sy, cur: null, hover: null };
      // falls through
      case 'newconn': {
        drag.moving = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6;
        drag.cur = w;
        drag.hover = targetAt(w, drag.from.ref, SNAP / view.k);
        bar.hidden = true;
        return drawUI();
      }
      case 'conn-end': {
        drag.moving = true;
        const c = doc.items[drag.id];
        drag.cur = w;
        drag.hover = targetAt(w, c[drag.end === 'from' ? 'to' : 'from'].ref, SNAP / view.k);
        c[drag.end] = endFor(drag.hover, w);
        delete c.chans;
        bar.hidden = true;
        renderConnectors();
        return drawUI();
      }
      case 'conn-seg': {
        drag.moving = true;
        const chans = drag.chans.map((c) => ({ ...c }));
        chans[drag.k].v = Math.round(drag.axis === 'x' ? w.x : w.y);
        doc.items[drag.id].chans = chans;
        delete doc.items[drag.id].mid;
        renderConnectors();
        return drawUI();
      }
      case 'conn-label': {
        drag.moving = true;
        const g = connGeom(doc.items[drag.id]);
        if (g) doc.items[drag.id].labelT = Math.max(0.05, Math.min(0.95, Conn.nearest(g.samples, [w.x, w.y]).t));
        renderConnectors();
        return drawUI();
      }
      case 'conn-move': {
        drag.moving = true;
        const ddx = Math.round((e.clientX - drag.sx) / view.k), ddy = Math.round((e.clientY - drag.sy) / view.k);
        const c = doc.items[drag.id];
        c.from = { x: drag.from.x + ddx, y: drag.from.y + ddy };
        c.to = { x: drag.to.x + ddx, y: drag.to.y + ddy };
        renderConnectors();
        return drawUI();
      }
      default: break;
    }
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    const moved = Math.hypot(dx, dy) > 4;
    if (drag.kind === 'marquee') {
      if (!moved && !drag.moving) return;
      drag.moving = true;
      const x = Math.min(drag.x0, w.x), y = Math.min(drag.y0, w.y);
      drag.rect = { x, y, w: Math.abs(w.x - drag.x0), h: Math.abs(w.y - drag.y0) };
      const hits = marqueeHits(drag.rect);
      if (drag.keep) { for (const id of drag.keep.ids) hits.set.add(id); for (const r of drag.keep.roots) hits.roots.add(r); for (const n of drag.keep.nodes || []) hits.nodes.add(n); }
      drag.hits = hits;
      if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; if (drag && drag.kind === 'marquee') render(); }); }
      return;
    }
    if (drag.kind === 'multi-scale') {
      drag.moving = true;
      const { box, ax, ay } = drag;
      // Escala uniforme: la proyección del cursor sobre la diagonal del marco.
      const vx = (w.x - ax) * drag.dirX, vy = (w.y - ay) * drag.dirY;
      const f = Math.max(0.1, Math.min(10, (vx * box.w + vy * box.h) / Math.max(1, box.w * box.w + box.h * box.h)));
      applyScale(drag, f);
      render();
      const r = stageRect();
      sizeTip.hidden = false;
      sizeTip.textContent = `${Math.round(f * 100)} %`;
      sizeTip.style.left = `${e.clientX - r.left + 14}px`;
      sizeTip.style.top = `${e.clientY - r.top + 14}px`;
      return;
    }
    if (drag.kind === 'multi-move') {
      if (!moved && !drag.moving) return;
      drag.moving = true;
      if (!drag.snap) {
        const ex = new Set([...drag.ms.items.map((i) => i[0]), ...drag.ms.conns.map((c) => c[0])]);
        drag.snap = { r0: multiBounds(), targets: snapTargets(ex, new Set(drag.ms.maps.map((m) => m[0]))) };
      }
      const s = snapDelta(drag.snap.r0, dx / view.k, dy / view.k, drag.snap.targets, e.altKey);
      shiftSel(drag.ms, Math.round(s.dx), Math.round(s.dy));
      drag.guides = s.guides;
      return render();
    }
    if (drag.pan) {
      if (!moved && !drag.moving) return;
      drag.moving = true;
      stage.classList.add('panning');
      view.x = drag.vx + dx;
      view.y = drag.vy + dy;
      return applyView();
    }
    if (drag.kind === 'colrz') {
      if (doc.items[drag.id].locked) return;
      drag.moving = true;
      doc.items[drag.id].cols[drag.c] = Math.max(48, Math.round(drag.start + dx / view.k));
      bar.hidden = true;
      return renderItems();
    }
    if (drag.kind === 'map') {
      if (!moved && !drag.moving) return;
      drag.moving = true;
      if (!drag.snap) drag.snap = { r0: layout.roots[drag.root] && layout.roots[drag.root].bounds, targets: snapTargets(new Set(), new Set([drag.root])) };
      const sn = snapDelta(drag.snap.r0, dx / view.k, dy / view.k, drag.snap.targets, e.altKey);
      drag.guides = sn.guides;
      mapSettings(doc, drag.root).origin = { x: Math.round(drag.ox + sn.dx), y: Math.round(drag.oy + sn.dy) };
      return render();
    }
    if (drag.kind === 'section') {
      if (!moved && !drag.moving) return;
      if (doc.items[drag.id].locked) return;
      drag.moving = true;
      if (!drag.snap) drag.snap = { r0: itemRect(drag.id), targets: snapTargets(new Set([drag.id, ...drag.inside.map((i) => i[0])]), new Set(drag.maps.map((m) => m[0]))) };
      const sn = snapDelta(drag.snap.r0, dx / view.k, dy / view.k, drag.snap.targets, e.altKey);
      drag.guides = sn.guides;
      const ddx = Math.round(sn.dx), ddy = Math.round(sn.dy);
      const it = doc.items[drag.id];
      it.x = drag.ox + ddx;
      it.y = drag.oy + ddy;
      for (const [id, x, y] of drag.inside) { doc.items[id].x = x + ddx; doc.items[id].y = y + ddy; }
      for (const [r, o] of drag.maps) mapSettings(doc, r).origin = { x: o.x + ddx, y: o.y + ddy };
      if (drag.maps.length) return render();
      bar.hidden = true;
      renderItems();
      gUI.innerHTML = guideLines().join('');
      return;
    }
    if (drag.kind === 'item') {
      if (!moved && !drag.moving) return;
      const it = doc.items[drag.id];
      if (it.locked) return;
      drag.moving = true;
      if (!drag.snap) drag.snap = { r0: itemRect(drag.id), targets: snapTargets(new Set([drag.id]), new Set()) };
      const s = snapDelta(drag.snap.r0, dx / view.k, dy / view.k, drag.snap.targets, e.altKey);
      it.x = Math.round(drag.ox + s.dx);
      it.y = Math.round(drag.oy + s.dy);
      drag.guides = s.guides;
      bar.hidden = true;
      renderItems();
      gUI.innerHTML = guideLines().join('');
      return;
    }
    if (drag.kind === 'resize') {
      const it = doc.items[drag.id], s = drag.start;
      if (it.locked) return;
      drag.moving = true;
      const ddx = dx / view.k, ddy = dy / view.k;
      if (it.type === 'note') { it.w = Math.max(120, Math.round(s.w + ddx)); it.h = Math.max(80, Math.round(s.h + ddy)); }
      else if (it.type === 'text') it.w = Math.max(40, Math.round(s.ow + ddx));
      else if (it.type === 'sticker') it.size = Math.max(16, Math.round(s.size + Math.max(ddx, ddy)));
      else if (it.type === 'image') it.w = Math.max(40, Math.round(s.w + ddx));
      else if (it.type === 'video') { it.w = Math.max(160, Math.round(s.w + ddx)); it.h = Math.round((it.w * s.h) / s.w); }
      else if (it.type === 'shape') { it.w = Math.max(30, Math.round(s.w + ddx)); it.h = Math.max(24, Math.round(s.h + ddy)); delete it.baseH; }
      else if (it.type === 'section') { it.w = Math.max(160, Math.round(s.w + ddx)); it.h = Math.max(100, Math.round(s.h + ddy)); }
      else if (it.type === 'chart') { it.w = Math.max(260, Math.round(s.w + ddx)); it.h = Math.max(180, Math.round(s.h + ddy)); }
      else if (it.type === 'ink') { const f = Math.max(0.1, (s.ow + ddx) / Math.max(1, s.ow)); it.pts = s.pts.map(([x, y]) => [Math.round(x * f * 10) / 10, Math.round(y * f * 10) / 10]); }
      bar.hidden = true;
      gUI.innerHTML = '';
      renderItems();
      // Tamaño exacto mientras se redimensiona .
      if (it.type === 'shape' || it.type === 'section' || it.type === 'chart') {
        const r = stageRect();
        sizeTip.hidden = false;
        sizeTip.textContent = `${it.w} × ${it.h}`;
        sizeTip.style.left = `${e.clientX - r.left + 14}px`;
        sizeTip.style.top = `${e.clientY - r.top + 14}px`;
      }
      return;
    }
    if (!drag.active && !moved) return;
    if (!drag.active) {
      drag.active = true;
      drag.ids = new Set(subtreeIds(drag.id));
      bar.hidden = true;
    }
    drag.world = mouseWorld;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; previewDrag(); });
    }
  });

  function endPointer() {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('panning');
    sizeTip.hidden = true;
    switch (d.kind) {
      case 'marquee':
        if (!d.moving || !d.hits) return render();
        return setMulti([...d.hits.set], [...d.hits.roots], [...d.hits.nodes]);
      case 'multi-scale':
        if (d.moving) commit(d.before);
        return render();
      case 'multi-move':
        if (d.moving) { commit(d.before); return render(); }
        // Clic sin arrastrar sobre uno de los elegidos: se queda solo ese.
        return tokRoot(d.gid) ? selectNode(d.nodeId || tokRoot(d.gid), false) : selectItem(d.gid);
      case 'ink':
        if (d.pts.length > 1 || d.pts.length === 1) addInk(d.pts.length === 1 ? [d.pts[0], [d.pts[0][0] + 0.5, d.pts[0][1] + 0.5]] : d.pts, d.hl);
        return render();
      case 'erase': if (d.removed) commit(d.before); return render();
      case 'lasso': {
        // Se eligen los trazos con la mayoría de sus puntos dentro del lazo.
        for (const it of Object.values(doc.items)) {
          if (it.type !== 'ink') continue;
          const pts = inkWorldPts(it);
          if (pts.filter((p) => Ink.inside(d.poly, p)).length / pts.length >= 0.6) selInks.add(it.id);
        }
        return render();
      }
      case 'inksel-move': if (d.moving) commit(d.before); return render();
      case 'qa-shape': return addShapeNext(d.dir);
      case 'newconn': {
        if (!d.moving) return render();
        const before = snapshot();
        const t = targetAt(d.cur, d.from.ref, SNAP / view.k);
        const id = createConn(d.from, endFor(t, d.cur));
        setTool('select');
        selItem = id;
        selectedId = null;
        commit(before);
        return render();
      }
      case 'conn-end': {
        if (!d.moving) return render();
        commit(d.before);
        return render();
      }
      case 'conn-seg': case 'conn-label': case 'conn-move':
        if (d.moving) commit(d.before);
        return render();
      default: break;
    }
    if (d.kind === 'map') {
      if (d.moving) { commit(d.before); return render(); }
      if (d.clickEdit) return startEdit(selectedId, { point: d.point });
      return render();
    }
    if (d.kind === 'section') {
      if (d.moving) { commit(d.before); return render(); }
      if (d.clickRename) return renameSection(d.id);
      return render();
    }
    if (d.kind === 'colrz') { commit(d.before); return render(); }
    if (d.kind === 'item' && d.cell && !d.moving) {
      if (d.cellWasSel) return startCellEdit(d.id, d.cell.r, d.cell.c, { point: d.point });
      selCell = d.cell;
      return render();
    }
    if (d.kind === 'item' || d.kind === 'resize') {
      if (d.moving) { commit(d.before); return render(); }
      const it = doc.items[d.id];
      if (d.kind === 'item' && d.clickEdit && it && it.type === 'video') { toggleVideo(d.id); return render(); }
      if (d.kind === 'item' && d.clickEdit && it && it.lines) return startItemEdit(d.id, { point: d.point });
      return render();
    }
    if (d.active) {
      if (d.slot) return moveTo(d.id, d.slot);
      return render();
    }
    if (!d.moving && d.clickEdit && (!d.pan || d.node)) return startEdit(selectedId, { point: d.point });
    render();
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  stage.addEventListener('dblclick', (e) => {
    if (editing) return;
    const sec = e.target.closest('.sec-title');
    if (sec) return renameSection(sec.parentNode.dataset.item);
    // Doble clic en un conector: editar su texto.
    // Doble clic en la línea (o en un tramo del conector ya seleccionado): editar su texto.
    const cn = e.target.closest('[data-conn], [data-clabel], [data-cseg]');
    if (cn) { selectItem(cn.dataset.conn || cn.dataset.clabel || selItem); return openPopover('menu-conn-label', bar.querySelector('[data-act="menu-conn-label"]') || bar); }
    const td = e.target.closest('.mm-item.table td');
    if (td) return startCellEdit(td.closest('.mm-item').dataset.item, +td.dataset.r, +td.dataset.c, { point: { x: e.clientX, y: e.clientY } });
    const it = e.target.closest('.mm-item');
    if (it && doc.items[it.dataset.item]?.lines) return startItemEdit(it.dataset.item, { point: { x: e.clientX, y: e.clientY } });
    const n = e.target.closest('.mm-node');
    if (n) startEdit(n.dataset.id, { point: { x: e.clientX, y: e.clientY } });
  });

  stage.addEventListener('wheel', (e) => {
    if (e.target.closest('#popover')) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    else {
      view.x -= e.shiftKey ? e.deltaY : e.deltaX;
      view.y -= e.shiftKey ? 0 : e.deltaY;
      applyView();
    }
  }, { passive: false });

  window.addEventListener('resize', () => (pendingFit ? fit() : applyView()));
  new ResizeObserver(() => { if (pendingFit) fit(); }).observe(stage);

  // Tooltips con atajos.
  function showTip(el) {
    const raw = el.dataset.tip;
    if (!raw) return;
    const [text, k] = raw.split(' · ');
    tip.innerHTML = `${esc(text)}${k ? k.split(' ').map((x) => `<kbd>${esc(x)}</kbd>`).join('') : ''}`;
    tip.hidden = false;
    const r = stageRect(), a = el.getBoundingClientRect();
    const side = el.closest('#toolbox');
    let left = side ? a.right - r.left + 8 : a.left - r.left + a.width / 2 - tip.offsetWidth / 2;
    left = Math.max(6, Math.min(r.width - tip.offsetWidth - 6, left));
    let top = side ? a.top - r.top + a.height / 2 - tip.offsetHeight / 2 : a.top - r.top - tip.offsetHeight - 8;
    if (top < 4) top = a.bottom - r.top + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  function hideTip() { tip.hidden = true; }

  // Tooltip de los gráficos: título y una fila por serie con su marca de color (el texto va en tinta).
  const chartTip = $('#chart-tip');
  function showChartTip(hit, e) {
    const [title, ...rows] = hit.getAttribute('data-tt').split('\n');
    chartTip.innerHTML = `<div class="tt-title">${esc(title)}</div>${rows.map((row) => {
      const [c, l, v] = row.split('|');
      return `<div class="tt-row"><span class="tt-key" style="background:${esc(c)}"></span>${esc(l)}<b>${esc(v)}</b></div>`;
    }).join('')}`;
    chartTip.hidden = false;
    const r = stageRect();
    let left = e.clientX - r.left + 14, top = e.clientY - r.top + 14;
    if (left + chartTip.offsetWidth > r.width - 8) left = e.clientX - r.left - chartTip.offsetWidth - 14;
    if (top + chartTip.offsetHeight > r.height - 8) top = e.clientY - r.top - chartTip.offsetHeight - 14;
    chartTip.style.left = `${left}px`;
    chartTip.style.top = `${top}px`;
  }
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && stage.contains(el)) showTip(el); else hideTip();
  });

  // ---------- Teclado ----------

  let switching = false;

  document.addEventListener('keydown', (e) => {
    if (switching) { e.preventDefault(); return; } // cambiando de mapa: que las teclas no caigan en el anterior
    const t = e.target;
    const inField = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
    if (!help.hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); toggleHelp(); } return; }
    if (!about.hidden) { if (e.key === 'Escape') { e.preventDefault(); toggleAbout(); } return; }
    if (!agentBox.hidden) { if (e.key === 'Escape') { e.preventDefault(); toggleAgent(); } return; }
    if (e.key === 'Escape' && !ctx.hidden) { e.preventDefault(); closeCtx(); return; }
    if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); closePopover(); return; }
    if (inField) return;
    if (editing) return onEditorKey(e);
    if (tool === 'draw' && !(e.ctrlKey || e.metaKey)) {
      const map = { KeyH: e.shiftKey ? 'highlighter' : 'pen', KeyE: 'eraser', KeyS: 'lasso' };
      if (map[e.code]) { e.preventDefault(); return setDrawTool(map[e.code]); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selInks.size) { e.preventDefault(); return act('ink-del'); }
      if (e.key === 'Escape') { e.preventDefault(); if (selInks.size) { selInks.clear(); return render(); } return setTool('select'); }
    }
    if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const stop = () => e.preventDefault();

    if (mod && k === 'z') { stop(); return e.shiftKey ? redo() : undo(); }
    if (mod && k === 'y') { stop(); return redo(); }

    // Tabla seleccionada: se navega por celdas como en una hoja de cálculo.
    if (selItem && doc.items[selItem]?.type === 'table') {
      const it = doc.items[selItem];
      if (selCell) {
        const arrows = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
        if (arrows[e.key] && !mod && !e.altKey) { stop(); const [dr, dc] = arrows[e.key]; return moveCell(dr, dc); }
        if (e.key === 'Tab') { stop(); return moveCell(0, e.shiftKey ? -1 : 1); }
        if (e.key === 'Enter' || e.key === 'F2') { stop(); return startCellEdit(selItem, selCell.r, selCell.c); }
        if ((e.key === 'Backspace' || e.key === 'Delete') && mod && e.altKey) { stop(); return tableOp('row-del'); }
        if (e.key === 'Delete' || e.key === 'Backspace') { stop(); return tableOp('clear-cell'); }
        if (e.key === 'Escape') { stop(); selCell = null; return render(); }
        if (mod && k === 'b') { stop(); return inlineFormat('bold'); }
        if (mod && k === 'i') { stop(); return inlineFormat('italic'); }
        // Escribir sobre una celda seleccionada la reemplaza.
        if (e.key.length === 1 && !mod && !e.altKey) { stop(); return startCellEdit(selItem, selCell.r, selCell.c, { replace: e.key }); }
      } else if (e.key === 'Enter') { stop(); selCell = { r: 0, c: 0 }; return render(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !selCell) { stop(); return deleteItem(); }
      void it;
    }

    if (mod && k === 'a') { stop(); return setMulti(Object.values(doc.items).filter((i) => !i.locked).map((i) => i.id), rootIdsOf(doc)); }
    if (e.shiftKey && !e.altKey && e.code === 'KeyL' && (selItem || multi.size)) { stop(); return lockSel(!(selItem && doc.items[selItem]?.locked)); }
    if (mod && e.altKey && e.code === 'KeyC' && selItem) { stop(); return copyStyle(); }
    if (mod && e.altKey && e.code === 'KeyV') { stop(); return pasteStyle(); }

    // Varios elementos seleccionados.
    if (multiCount() > 1) {
      if (e.key === 'Delete' || e.key === 'Backspace') { stop(); return deleteMulti(); }
      if (mod && k === 'd') { stop(); return duplicateMulti(); }
      if (e.key === 'Escape') { stop(); setTool('select'); return clearSelection(); }
      if (e.key.startsWith('Arrow') && !e.altKey && !mod) {
        stop();
        const step = e.shiftKey ? 20 : 2;
        const [ddx, ddy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        return nudgeMulti(ddx, ddy);
      }
      if (['Tab', 'Enter'].includes(e.key)) { stop(); return; }
    }

    // Objeto libre seleccionado.
    if (selItem && doc.items[selItem] && doc.items[selItem].locked) {
      if (e.key === 'Escape') { stop(); return clearSelection(); }
      if (e.key.startsWith('Arrow') || e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter' || (mod && k === 'd')) { stop(); return; }
    }
    if (selItem && doc.items[selItem]) {
      const it = doc.items[selItem];
      if (e.key === 'Delete' || e.key === 'Backspace') { stop(); return deleteItem(); }
      if (mod && k === 'd') { stop(); return duplicateItem(); }
      if (e.key === 'Enter' && it.type === 'section') { stop(); return renameSection(selItem); }
      if (e.key === 'Enter' && it.type === 'conn') { stop(); return openPopover('menu-conn-label', bar.querySelector('[data-act="menu-conn-label"]') || bar); }
      if (e.key === 'Enter' && it.lines) { stop(); return startItemEdit(selItem); }
      if (e.key === 'Escape') { stop(); setTool('select'); return clearSelection(); }
      if (e.altKey && e.key.startsWith('Arrow') && it.type === 'note') { stop(); return addNoteNext(e.key.slice(5).toLowerCase()); }
      if (e.key.startsWith('Arrow') && !e.altKey && it.type !== 'conn') {
        stop();
        const step = e.shiftKey ? 20 : 2;
        const [ddx, ddy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        return setItem(selItem, { x: it.x + ddx, y: it.y + ddy });
      }
      if (it.lines && mod) {
        if (e.shiftKey && k === 'x') { stop(); return inlineFormat('strike'); }
        if (e.shiftKey && k === 'u') { stop(); return inlineFormat('link'); }
        if (k === 'b') { stop(); return inlineFormat('bold'); }
        if (k === 'i') { stop(); return inlineFormat('italic'); }
      }
    }

    if (!selectedId && !selItem) {
      if (['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { stop(); return selectNode(doc.rootId); }
    }
    if (selectedId) {
      // Posición física de [ y ], o el carácter si el teclado lo envía.
      const bracket = e.code === 'BracketLeft' || e.key === '[' ? 'out' : e.code === 'BracketRight' || e.key === ']' ? 'in' : null;
      if (mod && e.altKey && bracket) { stop(); return bracket === 'out' ? outdent() : indent(); }
      if (mod && k === 'd') { stop(); return duplicate(); }
      if (mod && (e.code === 'Slash' || k === '/')) { stop(); return toggleCollapse(); }
      if (mod && e.shiftKey && k === 'x') { stop(); return inlineFormat('strike'); }
      if (mod && e.shiftKey && k === 'k') { stop(); return inlineFormat('code'); }
      if (mod && e.shiftKey && k === 'h') { stop(); return inlineFormat('mark'); }
      if (mod && e.shiftKey && k === 'u') { stop(); return inlineFormat('link'); }
      if (mod && k === 'b') { stop(); return inlineFormat('bold'); }
      if (mod && k === 'i') { stop(); return inlineFormat('italic'); }
      if (mod && e.key === 'Enter') { stop(); return addSibling(selectedId, true); }
      if (e.altKey && e.key === 'Enter') { stop(); return addParent(); }
      if (e.altKey && e.key.startsWith('Arrow')) { stop(); return quickAddDir(e.key.slice(5).toLowerCase()); }
      if (e.shiftKey && e.code === 'KeyX' && !mod && !e.altKey) { stop(); return openPopover('menu-icon', bar.querySelector('[data-act="menu-icon"]') || bar); }
      if (!mod && !e.altKey) {
        switch (e.key) {
          case 'Tab': stop(); return addChild();
          case 'Enter': case 'F2': stop(); return startEdit(selectedId); // selecciona todo el texto
          case 'Delete': case 'Backspace': stop(); return deleteNode();
          case 'Escape': stop(); setTool('select'); return clearSelection();
          case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': stop(); return navigate(e.key.slice(5).toLowerCase());
          default: break;
        }
      }
    }
    if (mod || e.altKey) return;
    // Teclas de herramienta y de vista .
    const shapeKey = Shapes.CATALOG.find((c) => c[2] && e.code === `Key${c[2]}`);
    if (shapeKey && !e.shiftKey) { stop(); return placeTool(`shape:${shapeKey[0]}`, here()); }
    if (e.key === '.' && !e.shiftKey) { stop(); return placeTool('section', here()); }
    if (e.code === 'KeyE' && !e.shiftKey) { stop(); return placeTool('table', here()); }
    switch (e.code) {
      case 'KeyN': stop(); return placeTool('note', here());
      case 'KeyM': stop(); return placeTool('mindmap', here());
      case 'KeyT': stop(); return placeTool('text', here());
      case 'KeyX': if (!e.shiftKey) { stop(); return placeTool('sticker', here()); } break;
      case 'KeyI': stop(); return placeTool('image', here());
      case 'KeyV': stop(); return setTool('select');
      case 'KeyC': stop(); return setTool('conn');
      case 'KeyH': stop(); setTool('draw'); return setDrawTool(e.shiftKey ? 'highlighter' : 'pen');
      case 'KeyQ': stop(); quickAddHidden = !quickAddHidden; return render();
      default: break;
    }
    switch (e.key) {
      case '=': case '+': stop(); return zoomAt(1.2);
      case '-': stop(); return zoomAt(1 / 1.2);
      case '0': stop(); return zoomTo(1);
      case '1': stop(); return fit();
      case '2': stop(); { const b = selItem ? itemRect(selItem) : layout.boxes[selectedId]; if (b) { zoomTo(1.5); ensureVisibleRect(b); } } return;
      case '?': stop(); return toggleHelp();
      case 'Escape': stop(); setTool('select'); return clearSelection();
      default: break;
    }
  });

  document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

  function onEditorKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const { id, kind } = editing;
    const el = editEl();
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (kind === 'cell') {
      // Como en una hoja de cálculo: Tab a la derecha, Enter abajo (crea fila al final), Shift+Enter salto de línea.
      if (e.key === 'Enter' && e.shiftKey) { stop(); return document.execCommand('insertLineBreak'); }
      if (e.key === 'Enter') { stop(); commitEdit(); return moveCell(1, 0, { edit: true, grow: true }); }
      if (e.key === 'Tab') { stop(); commitEdit(); return moveCell(0, e.shiftKey ? -1 : 1, { edit: true, grow: !e.shiftKey }); }
      if (e.key === 'Escape') { stop(); return commitEdit(); }
      if (mod && e.shiftKey && k === 'x') { stop(); return inlineFormat('strike'); }
      if (mod && e.shiftKey && k === 'u') { stop(); return inlineFormat('link'); }
      return;
    }
    if (kind === 'item') {
      // En notas y textos, Enter es salto de línea; Escape termina.
      if (e.key === 'Enter') { stop(); return splitLine(el); }
      if (e.key === 'Escape' || e.key === 'Tab') { stop(); return commitEdit(); }
    } else {
      if (e.key === 'Enter' && e.shiftKey) { stop(); return splitLine(el); }
      if (e.key === 'Enter' && mod) { stop(); commitEdit(); return addSibling(id, true); }
      if (e.key === 'Enter' && e.altKey) { stop(); commitEdit(); return addParent(id); }
      if (e.key === 'Enter') { stop(); commitEdit(); return addSibling(id); }
      if (e.key === 'Tab') { stop(); commitEdit(); return e.shiftKey ? undefined : addChild(id); }
      if (e.key === 'Escape') { stop(); return commitEdit(); }
    }
    if (mod && e.shiftKey && k === 'x') { stop(); return inlineFormat('strike'); }
    if (mod && e.shiftKey && k === 'k') { stop(); return inlineFormat('code'); }
    if (mod && e.shiftKey && k === 'h') { stop(); return inlineFormat('mark'); }
    if (mod && e.shiftKey && k === 'u') { stop(); return inlineFormat('link'); }
  }

  stage.addEventListener('input', (e) => { if (editing && e.target.closest('.mm-text, .cell')) onEditorInput(); });

  // ---------- Mapas ----------

  const titleOf = (m) => (m.title && m.title.trim()) || plainText(m.doc.nodes[m.doc.rootId]).trim() || 'Sin título';

  function updateHeader() {
    if (!map) return;
    if (document.activeElement !== titleInput) titleInput.value = map.title || '';
    titleInput.placeholder = titleOf({ ...map, title: '' });
    const path = Sidebar.folderPath(map.folderId || null);
    $('#breadcrumb').textContent = path.length ? `${path.map((f) => f.name).join(' / ')} /` : '';
  }

  async function openMap(id) {
    switching = true;
    try { await loadMap(id); } finally { switching = false; }
  }

  async function loadMap(id) {
    if (editing) commitEdit();
    if (saveTimer) await saveNow();
    const m = await Store.get(id);
    if (!m) return;
    syncBase = JSON.stringify(m);
    map = m;
    doc = normalizeDoc(m.doc);
    remotePending = false;
    Store.reportOpen(id);
    history.past = [];
    history.future = [];
    selectedId = doc.rootId;
    selItem = null;
    for (const rec of els.values()) rec.el.remove();
    els.clear();
    for (const rec of itemEls.values()) rec.el.remove();
    itemEls.clear();
    pref('mindmap:last', id);
    setTool('select');
    render();
    fit();
    await Sidebar.refresh();
    updateHeader();
  }

  async function createMap(folderId = null) {
    switching = true;
    try {
      const m = { id: uid(), title: '', folderId, doc: newDoc(), createdAt: Date.now(), updatedAt: Date.now() };
      await Store.put(m);
      await loadMap(m.id);
    } finally { switching = false; }
    startEdit(doc.rootId);
  }

  async function deleteMap(id) {
    const m = await Store.get(id);
    if (!m || !(await uiConfirm(`Se borrará «${titleOf(m)}» con todo lo que contiene. No se puede deshacer.`, { title: '¿Borrar el mapa?', ok: 'Borrar', danger: true }))) return;
    await Store.remove(id);
    if (map && map.id === id) {
      map = null;
      const rest = (await Store.all()).sort((a, b) => b.updatedAt - a.updatedAt);
      if (rest.length) await openMap(rest[0].id); else await createMap(null);
    } else Sidebar.refresh();
  }

  async function moveMap(id, folderId) {
    if (map && map.id === id) { map.folderId = folderId; await saveNow(); updateHeader(); return; }
    const m = await Store.get(id);
    if (!m) return;
    m.folderId = folderId;
    await Store.put(m);
  }

  async function renameMap(id, title) {
    if (map && map.id === id) { map.title = title; await saveNow(); updateHeader(); return; }
    const m = await Store.get(id);
    if (!m) return;
    m.title = title;
    await Store.put(m);
  }

  // Color e icono del mapa en la barra lateral.
  async function setMapMeta(id, patch) {
    if (map && map.id === id) { Object.assign(map, patch); await saveNow(); return; }
    const m = await Store.get(id);
    if (!m) return;
    Object.assign(m, patch);
    await Store.put(m);
  }

  async function duplicateMap(id) {
    if (saveTimer) await saveNow();
    const m = await Store.get(id);
    if (!m) return;
    const copy = { ...JSON.parse(JSON.stringify(m)), id: uid(), title: `${titleOf(m)} (copia)`, createdAt: Date.now(), updatedAt: Date.now() };
    await Store.put(copy);
    await openMap(copy.id);
  }

  Sidebar.init({
    Store, UI, SIDE_ICONS, SIDE_EMOJIS, esc, titleOf, setMapMeta, confirm: (...args) => uiConfirm(...args),
    currentId: () => (map ? map.id : null),
    currentTitle: () => (map ? titleOf(map) : ''),
    openMap, createMap, deleteMap, moveMap, renameMap, duplicateMap,
  });

  titleInput.addEventListener('input', () => { if (map) { map.title = titleInput.value; saveSoon(); } });
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') titleInput.blur(); });

  // ---------- Copias de seguridad y exportar ----------

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function dataUrlToBlob(url) {
    const [head, b64] = url.split(',');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: head.slice(5, head.indexOf(';')) });
  }

  const blobToDataURL = (blob) => new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ko(fr.error); fr.readAsDataURL(blob); });

  async function exportBackup() {
    if (saveTimer) await saveNow();
    const [all, folders] = await Promise.all([Store.all(), Store.folders.all()]);
    const date = new Date().toISOString().slice(0, 10);
    // Los vídeos subidos van dentro de la copia (como texto base64).
    const media = {};
    for (const m of all) {
      for (const it of Object.values(m.doc.items || {})) {
        if (it.type !== 'video' || !it.mediaId || media[it.mediaId]) continue;
        const rec = await Store.media.get(it.mediaId);
        if (rec) media[it.mediaId] = { type: rec.type, name: rec.name, data: await blobToDataURL(rec.blob) };
      }
    }
    download(`mapache-copia-${date}.json`, new Blob([JSON.stringify({ app: 'mapache', version: 4, folders, maps: all, media }, null, 2)], { type: 'application/json' }));
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data.maps) ? data.maps : data.doc ? [{ id: uid(), title: '', doc: data.doc }] : [];
      for (const f of data.folders || []) await Store.folders.put(f);
      for (const [id, m] of Object.entries(data.media || {})) if (m && m.data) await Store.media.put({ id, type: m.type, name: m.name, blob: dataUrlToBlob(m.data) });
      for (const m of list) {
        normalizeDoc(m.doc);
        await Store.put({ id: m.id || uid(), title: m.title || '', folderId: m.folderId || null, doc: m.doc, createdAt: m.createdAt || Date.now(), updatedAt: m.updatedAt || Date.now() });
      }
      toast(`Importados ${list.length} mapa(s) y ${(data.folders || []).length} carpeta(s)`);
      if (list[0] && list[0].id) await openMap(list[0].id); else await Sidebar.refresh();
    } catch (err) {
      uiAlert(`No se pudo importar: ${err.message}`);
    }
  }

  let cssText = null;
  async function buildImage(kind) {
    if (editing) commitEdit();
    const prev = [selectedId, selItem, hoverId, hoverItem];
    selectedId = null; selItem = null; hoverId = null; hoverItem = null;
    render();
    if (!cssText) cssText = await (await fetch('styles.css')).text();
    const b = contentBounds(), pad = 48;
    const w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2);
    const ox = pad - b.x, oy = pad - b.y;
    // XMLSerializer da XHTML válido (<br/>, <img/>…); outerHTML rompería el SVG.
    const xs = new XMLSerializer();
    const html = (layer) => [...layer.children].map((el) => xs.serializeToString(el)).join('');
    const fo = (content) => `<foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${w}px;height:${h}px">` +
      `<style><![CDATA[${cssText}]]></style><div style="position:absolute;left:${ox}px;top:${oy}px">${content}</div></div></foreignObject>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<rect width="${w}" height="${h}" fill="${THEME_COLORS[theme].bg}"/>${fo(html(sectionsLayer) + html(backLayer))}` +
      `<g transform="translate(${ox},${oy})">${gLines.innerHTML}${gUI.innerHTML}</g>${fo(html(world) + html(frontLayer))}<g transform="translate(${ox},${oy})">${gConns.innerHTML}</g></svg>`;
    [selectedId, selItem, hoverId, hoverItem] = prev;
    render();
    if (kind === 'svg') return new Blob([svg], { type: 'image/svg+xml' });
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const scale = 2;
    const canvas = Object.assign(document.createElement('canvas'), { width: w * scale, height: h * scale });
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  }

  async function exportImage(kind) {
    const name = (titleOf(map) || 'mapa').replace(/[\\/:*?"<>|]+/g, '').slice(0, 60);
    try {
      download(`${name}.${kind}`, await buildImage(kind));
    } catch (err) {
      uiAlert(`No se pudo crear la imagen (${err.message}). Prueba a exportar en SVG.`);
    }
  }

  // ---------- Diálogos (en lugar de los cuadros del navegador) ----------

  const dialogEl = $('#dialog');
  function uiDialog(msg, { ok = 'Aceptar', cancel = null, danger = false, title = '' } = {}) {
    return new Promise((resolve) => {
      dialogEl.querySelector('.dialog-title').textContent = title;
      dialogEl.querySelector('.dialog-title').hidden = !title;
      dialogEl.querySelector('.dialog-msg').textContent = msg;
      const okB = dialogEl.querySelector('[data-dlg="ok"]'), cB = dialogEl.querySelector('[data-dlg="cancel"]');
      okB.textContent = ok;
      okB.classList.toggle('danger', danger);
      cB.hidden = !cancel;
      if (cancel) cB.textContent = cancel;
      dialogEl.hidden = false;
      okB.focus();
      const done = (v) => {
        dialogEl.hidden = true;
        dialogEl.onclick = null;
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
        else if (e.key !== 'Tab') e.stopPropagation();
      };
      document.addEventListener('keydown', onKey, true);
      dialogEl.onclick = (e) => {
        const b = e.target.closest('[data-dlg]');
        if (b) done(b.dataset.dlg === 'ok');
        else if (e.target === dialogEl) done(false);
      };
    });
  }
  const uiAlert = (msg, opts) => uiDialog(msg, opts);
  const uiConfirm = (msg, opts = {}) => uiDialog(msg, { cancel: 'Cancelar', ...opts });

  // ---------- Tema claro u oscuro ----------

  let themePref = pref('mindmap:theme') || 'dark';
  const prefersLight = matchMedia('(prefers-color-scheme: light)');

  function applyTheme() {
    theme = themePref === 'system' ? (prefersLight.matches ? 'light' : 'dark') : themePref;
    const T = THEME_COLORS[theme];
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', T.meta);
    SURFACE = T.surface;
    CONN_COLOR = T.conn;
    Object.assign(NOTE_COLORS, T.notes);
    Object.assign(TEXT_COLORS, T.text);
    SHAPE_COLORS.white = T.shapeWhite;
    SHAPE_COLORS.gray = T.shapeGray;
    INK_COLORS.white = T.inkWhite;
    Charts.setTheme(theme);
    // Todo se vuelve a dibujar con los colores nuevos.
    for (const rec of itemEls.values()) { rec.sig = ''; rec.shapeSig = ''; rec.chartSig = ''; }
    if (doc) render();
    setIcon('#theme-btn', theme === 'light' ? UI.sun : UI.moon);
  }

  function setThemePref(v) {
    themePref = v;
    pref('mindmap:theme', v);
    applyTheme();
  }
  prefersLight.addEventListener('change', () => { if (themePref === 'system') applyTheme(); });

  // ---------- Barra superior, zoom y ayuda ----------

  function toggleHelp() { help.hidden = !help.hidden; }

  // Tarjeta del creador (botón «Información», junto al de atajos).
  const about = $('#about');
  function toggleAbout() { about.hidden = !about.hidden; }
  about.addEventListener('click', (e) => { if (e.target === about) toggleAbout(); });
  for (const el of about.querySelectorAll('[data-icon]')) el.innerHTML = UI[el.dataset.icon] || '';

  // Conectar tu agente de IA: un texto para pegarle y, si prefieres hacerlo tú, la orden exacta para cada agente.
  const agentBox = $('#agent');
  const REPO_URL = 'https://github.com/Hackeatutiempo/mapache';
  let agentTab = 'claude-code';
  async function toggleAgent() {
    agentBox.hidden = !agentBox.hidden;
    if (!agentBox.hidden) await fillAgent();
  }
  async function fillAgent() {
    let info = null;
    try { const r = await fetch('api/info', { cache: 'no-store' }); if (r.ok) info = await r.json(); } catch { /* sin servidor */ }
    const q = (s) => (/[\s"]/.test(s) ? `"${s}"` : s);
    const node = info && info.node ? info.node : 'node';
    const bin = info && info.bin ? info.bin : '~/Mapache/bin/mapache.js';
    const json = (o) => JSON.stringify(o, null, 2);
    const std = { mcpServers: { mapache: { command: node, args: [bin, 'mcp'] } } };
    const tabs = [
      ['claude-code', 'Claude Code', `claude mcp add --scope user mapache -- ${q(node)} ${q(bin)} mcp`,
        tr('Ejecútalo en una terminal y abre una conversación nueva de Claude Code.')],
      ['claude-desktop', 'Claude Desktop', json(std),
        tr('En Claude Desktop: Ajustes > Desarrollador > Editar configuración. Añade esto a claude_desktop_config.json y reinicia Claude.')],
      ['codex', 'Codex', `codex mcp add mapache -- ${q(node)} ${q(bin)} mcp`,
        tr('Codex es el agente de OpenAI (incluido en los planes de ChatGPT). Ejecútalo en una terminal y abre una sesión nueva.')],
      ['cursor', 'Cursor', json(std), tr('Añádelo a ~/.cursor/mcp.json (o en Cursor: Ajustes > MCP).')],
      ['vscode', 'VS Code', json({ servers: { mapache: { type: 'stdio', command: node, args: [bin, 'mcp'] } } }),
        tr('En VS Code: paleta de comandos > «MCP: Open User Configuration», y pega esto.')],
      ['gemini', 'Gemini CLI', `gemini mcp add mapache ${q(node)} ${q(bin)} mcp`, tr('Ejecútalo en una terminal y abre una sesión nueva.')],
      ['chatgpt', 'ChatGPT', `${q(node)} ${q(bin)} help`,
        tr('ChatGPT en la web o el móvil no llega solo a tu ordenador. Usa Codex, o conecta ChatGPT con tu ordenador mediante Desktop Commander y pídele que use la línea de comandos de Mapache (esta orden muestra la ayuda).')],
    ];
    const cur = tabs.find((x) => x[0] === agentTab) || tabs[0];
    $('#agent-tabs').innerHTML = tabs.map(([k, name]) => `<button role="tab" data-agent-tab="${k}" aria-selected="${k === cur[0]}">${esc(name)}</button>`).join('');
    $('#agent-snippet').textContent = cur[2];
    $('#agent-hint').textContent = cur[3];
    const dir = info && info.appDir ? info.appDir : '~/Mapache';
    const guide = info && info.appDir ? `${info.appDir}${info.appDir.includes('\\') ? '\\' : '/'}AGENTS.md` : `${REPO_URL}/blob/main/AGENTS.md`;
    $('#agent-prompt').textContent = tr('Conecta Mapache contigo como servidor MCP. Está instalado en {dir}. Sigue la sección «Connect Mapache to your AI agent» de {guide}. Cuando esté conectado, dime cómo usarlo.', { dir, guide });
    const where = $('#agent-where');
    const s = Store.status();
    where.classList.toggle('warn', s.mode !== 'online');
    where.textContent = s.mode === 'online' ? tr('Tus tableros se guardan en {dir}. Tu agente usa esos mismos archivos.', { dir: s.dataDir })
      : tr('Ahora Mapache no está en marcha en este ordenador. Ábrelo con «Abrir Mapache» (o npm start) para que tu agente y esta pestaña compartan los tableros.');
  }
  agentBox.addEventListener('click', async (e) => {
    if (e.target === agentBox) return toggleAgent();
    const tab = e.target.closest('[data-agent-tab]');
    if (tab) { agentTab = tab.dataset.agentTab; return fillAgent(); }
    const b = e.target.closest('[data-copy]');
    if (b) {
      const text = $(`#${b.dataset.copy}`).textContent;
      try { await navigator.clipboard.writeText(text); toast(tr('Copiado')); } catch { toast(tr('No se pudo copiar: selecciónalo y cópialo a mano')); }
    }
  });
  for (const el of agentBox.querySelectorAll('[data-icon]')) el.innerHTML = UI[el.dataset.icon] || '';

  const commands = {
    undo, redo, fit, help: toggleHelp, about: toggleAbout, agent: toggleAgent,
    'zoom-in': () => zoomAt(1.2), 'zoom-out': () => zoomAt(1 / 1.2), 'zoom-reset': () => zoomTo(1),
  };
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cmd]');
    if (c && commands[c.dataset.cmd]) { commands[c.dataset.cmd](); c.blur(); }
  });
  help.addEventListener('click', (e) => { if (e.target === help) toggleHelp(); });

  const setIcon = (sel, icon, label) => { const el = $(sel); el.innerHTML = label ? `${icon}<span>${label}</span>` : icon; };
  setIcon('#new-map', UI.plus);
  setIcon('#toggle-sidebar', UI.sidebar);
  setIcon('#export-png', UI.image);
  $('#theme-btn').addEventListener('click', (e) => openPopover('menu-theme', e.currentTarget));
  applyTheme();
  setIcon('#agent-open', UI.sparkles, tr('Conectar agente de IA'));
  setIcon('#backup-export', UI.download, 'Exportar copia de seguridad');
  setIcon('#backup-import', UI.upload, 'Importar copia');
  for (const [cmd, icon] of [['undo', UI.undo], ['redo', UI.redo], ['zoom-out', UI.minus], ['zoom-in', UI.plus], ['fit', UI.fit], ['help', UI.help], ['about', UI.info]]) {
    const el = document.querySelector(`#zoombar [data-cmd="${cmd}"]`);
    if (el) el.innerHTML = icon;
  }
  for (const [t, icon] of [['select', UI.cursor], ['hand', UI.hand], ['shape', UI.shape], ['mindmap', UI.map], ['note', UI.note], ['conn', UI.connector], ['text', UI.text], ['sticker', UI.sticker], ['image', UI.image], ['table', UI.table], ['draw', UI.draw], ['section', UI.section]]) {
    document.querySelector(`#toolbox [data-tool="${t}"]`).innerHTML = icon;
  }
  for (const [k, icon] of [['close', UI.close], ['pen', UI.pen], ['highlighter', UI.highlighter], ['eraser', UI.eraser], ['lasso', UI.lasso], ['thin', UI.thin], ['thick', UI.thick], ['detect', UI.detect]]) {
    document.querySelector(`#drawbox [data-draw="${k}"]`).innerHTML = icon;
  }
  // Panel de dibujo: herramienta, grosor, detectar formas y color.
  $('#drawbox').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  $('#drawbox').addEventListener('click', (e) => {
    const b = e.target.closest('[data-draw]');
    if (!b) return;
    const k = b.dataset.draw;
    if (k === 'close') return setTool('select');
    if (['pen', 'highlighter', 'eraser', 'lasso'].includes(k)) return setDrawTool(k);
    if (k === 'thin' || k === 'thick') { inkPrefs.thick = k === 'thick'; saveInkPrefs(); return syncDrawbox(); }
    if (k === 'detect') { inkPrefs.detect = !inkPrefs.detect; saveInkPrefs(); return syncDrawbox(); }
    if (k === 'color') {
      if (!pop.hidden && pop.dataset.kind === 'menu-draw-color') return closePopover();
      return openPopover('menu-draw-color', b);
    }
  });
  $('#toggle-sidebar').addEventListener('click', () => { document.body.classList.toggle('no-sidebar'); applyView(); });
  $('#export-png').addEventListener('click', () => exportImage('png'));
  $('#backup-export').addEventListener('click', exportBackup);
  $('#backup-import').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });

  // ---------- Arranque ----------

  async function start() {
    Store.persist();
    setTool('select');
    await Store.ready();
    updateSaveTip();
    const all = await Store.all();
    if (!all.length) return createMap(null);
    if (await openFromHash()) return;
    const last = pref('mindmap:last');
    const pick = all.find((m) => m.id === last) || all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    await openMap(pick.id);
  }

  window.addEventListener('hashchange', () => { openFromHash(); });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // Si sale una versión nueva con la pestaña abierta, se avisa para recargar (si no, seguiría el código viejo).
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) $('#update-bar').hidden = false; });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 30 * 60 * 1000);
    }).catch(() => {});
  }
  $('#update-reload').addEventListener('click', async () => {
    if (editing) commitEdit();
    await saveNow();
    location.reload();
  });

  // Acceso para pruebas desde las herramientas de desarrollo.
  window.mapache = {
    get doc() { return doc; }, get layout() { return layout; }, get selectedId() { return selectedId; },
    get selItem() { return selItem; }, get multi() { return [...multi, ...[...multiRoots].map(mapTok), ...[...multiNodes].map(nodeTok)]; }, get editing() { return editing; }, get tool() { return tool; },
    selectNode, selectItem, addChild, addSibling, openMap, createMap, act, buildImage, createItem, addImages,
  };

  document.fonts.ready.then(start);
})();
