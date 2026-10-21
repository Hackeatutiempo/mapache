// Barra lateral: carpetas anidadas y mapas, con menú contextual, renombrar y arrastrar para mover.
(function (root) {
  'use strict';
  const t = root.MMI18n.t;
  let api;
  let folders = [];
  let maps = [];
  const list = () => document.querySelector('#map-list');
  const menu = () => document.querySelector('#side-menu');
  const uid = () => crypto.randomUUID();
  // Colores para carpetas y mapas (tonos claros, legibles sobre la barra oscura).
  const COLORS = { purple: '#a78bfa', blue: '#60a5fa', teal: '#2dd4bf', green: '#4ade80', yellow: '#facc15',
    orange: '#fb923c', red: '#f87171', pink: '#f472b6', gray: '#94a3b8' };

  // Icono de una fila: el elegido (de línea o emoji) o el de siempre, en su color.
  function rowIcon(x, fallback) {
    const { SIDE_ICONS } = api;
    const color = COLORS[x.color];
    const style = color ? ` style="color:${color}"` : '';
    if (x.icon && x.icon.startsWith('svg:') && SIDE_ICONS[x.icon.slice(4)]) return `<span class="row-icon"${style}>${SIDE_ICONS[x.icon.slice(4)]}</span>`;
    if (x.icon) return `<span class="row-icon emoji">${api.esc(x.icon)}</span>`;
    return `<span class="row-icon"${style}>${SIDE_ICONS[fallback]}</span>`;
  }

  function init(a) {
    api = a;
    const l = list();
    l.addEventListener('click', onClick);
    l.addEventListener('contextmenu', onContext);
    l.addEventListener('dragstart', onDragStart);
    l.addEventListener('dragover', onDragOver);
    l.addEventListener('dragleave', (e) => { const r = e.target.closest('.row'); if (r) r.classList.remove('drop'); l.classList.remove('drop-root'); });
    l.addEventListener('drop', onDrop);
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#side-menu')) closeMenu(); });
    document.querySelector('#new-map').addEventListener('click', (e) => openMenu(e.currentTarget, [
      [t('Nuevo mapa'), () => api.createMap(null)],
      [t('Nueva carpeta'), () => newFolder(null)],
    ]));
  }

  async function refresh() {
    [folders, maps] = await Promise.all([api.Store.folders.all(), api.Store.all()]);
    const cur = maps.find((m) => m.id === api.currentId());
    if (cur) expandTo(cur.folderId);
    render();
  }

  function expandTo(folderId) {
    for (let f = folders.find((x) => x.id === folderId); f; f = folders.find((x) => x.id === f.parentId)) {
      if (f.collapsed) { f.collapsed = false; api.Store.folders.put(f); }
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

  function render() {
    const { UI, esc } = api;
    const rows = [];
    const walk = (parentId, depth) => {
      for (const f of folders.filter((x) => (x.parentId || null) === parentId).sort(byName)) {
        const count = countMaps(f.id);
        rows.push(`<div class="row folder" draggable="true" data-folder="${f.id}" style="--d:${depth}">` +
          `<span class="chev${f.collapsed ? '' : ' open'}">${UI.chevron}</span>${rowIcon(f, 'folder')}` +
          `<span class="name">${esc(f.name)}</span><span class="count">${count || ''}</span>` +
          `<button class="row-btn" data-add="${f.id}" title="${t('Nuevo mapa aquí')}">${UI.plus}</button>` +
          `<button class="row-btn" data-more-folder="${f.id}" title="${t('Opciones')}">${UI.more}</button></div>`);
        if (!f.collapsed) walk(f.id, depth + 1);
      }
      const ms = maps.filter((m) => (m.folderId || null) === parentId).sort((a, b) => b.updatedAt - a.updatedAt);
      for (const m of ms) {
        const active = m.id === api.currentId();
        rows.push(`<div class="row map${active ? ' active' : ''}" draggable="true" data-map="${m.id}" style="--d:${depth}">` +
          `<span class="chev"></span>${rowIcon(m, 'map')}<span class="name">${esc(active ? api.currentTitle() : api.titleOf(m))}</span>` +
          `<button class="row-btn" data-more-map="${m.id}" title="${t('Opciones')}">${UI.more}</button></div>`);
      }
    };
    walk(null, 0);
    list().innerHTML = rows.join('') || `<div class="empty-list">${t('Sin mapas todavía')}</div>`;
  }

  function countMaps(folderId) {
    const ids = new Set([folderId, ...descendants(folderId)]);
    return maps.filter((m) => ids.has(m.folderId)).length;
  }

  function descendants(folderId) {
    const out = [];
    const stack = [folderId];
    while (stack.length) {
      const id = stack.pop();
      for (const f of folders) if (f.parentId === id) { out.push(f.id); stack.push(f.id); }
    }
    return out;
  }

  function folderPath(folderId) {
    const path = [];
    for (let f = folders.find((x) => x.id === folderId); f; f = folders.find((x) => x.id === f.parentId)) path.unshift(f);
    return path;
  }

  // ---------- Acciones ----------

  async function newFolder(parentId) {
    const f = { id: uid(), name: t('Nueva carpeta'), parentId, collapsed: false, createdAt: Date.now() };
    await api.Store.folders.put(f);
    if (parentId) expandTo(parentId);
    await refresh();
    rename('folder', f.id);
  }

  function rename(kind, id) {
    const row = list().querySelector(kind === 'folder' ? `[data-folder="${id}"]` : `[data-map="${id}"]`);
    if (!row) return;
    const nameEl = row.querySelector('.name');
    const input = document.createElement('input');
    input.className = 'rename';
    input.value = kind === 'folder' ? folders.find((f) => f.id === id).name : nameEl.textContent;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (save && v) {
        if (kind === 'folder') {
          const f = folders.find((x) => x.id === id);
          f.name = v;
          await api.Store.folders.put(f);
        } else await api.renameMap(id, v);
      }
      refresh();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  async function deleteFolder(id) {
    const f = folders.find((x) => x.id === id);
    if (!(await api.confirm(t('Sus mapas y subcarpetas no se borran: pasan a la carpeta superior.'), { title: t('¿Borrar la carpeta «{name}»?', { name: f.name }), ok: t('Borrar carpeta'), danger: true }))) return;
    for (const sub of folders.filter((x) => x.parentId === id)) { sub.parentId = f.parentId || null; await api.Store.folders.put(sub); }
    for (const m of maps.filter((x) => x.folderId === id)) await api.moveMap(m.id, f.parentId || null);
    await api.Store.folders.remove(id);
    refresh();
  }

  async function moveFolder(id, parentId) {
    if (id === parentId || descendants(id).includes(parentId)) return;
    const f = folders.find((x) => x.id === id);
    f.parentId = parentId;
    await api.Store.folders.put(f);
    if (parentId) expandTo(parentId);
    refresh();
  }

  // Lista de destinos para «Mover a…»: todas las carpetas con sangría.
  function destinations(exclude = new Set()) {
    const out = [[t('Sin carpeta'), null, 0]];
    const walk = (parentId, depth) => {
      for (const f of folders.filter((x) => (x.parentId || null) === parentId).sort(byName)) {
        if (exclude.has(f.id)) continue;
        out.push([f.name, f.id, depth]);
        walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return out;
  }

  function moveMenu(anchor, kind, id) {
    const exclude = kind === 'folder' ? new Set([id, ...descendants(id)]) : new Set();
    openMenu(anchor, destinations(exclude).map(([name, fid, depth]) =>
      [`${'   '.repeat(depth)}${name}`, () => (kind === 'folder' ? moveFolder(id, fid) : api.moveMap(id, fid).then(refresh))]));
  }

  function folderMenu(anchor, id) {
    openMenu(anchor, [
      [t('Nuevo mapa aquí'), () => api.createMap(id)],
      [t('Nueva subcarpeta'), () => newFolder(id)],
      [t('Renombrar'), () => rename('folder', id)],
      [t('Personalizar…'), () => picker(anchor, 'folder', id)],
      [t('Mover a…'), () => moveMenu(anchor, 'folder', id)],
      null,
      [t('Borrar carpeta'), () => deleteFolder(id), 'danger'],
    ]);
  }

  function mapMenu(anchor, id) {
    openMenu(anchor, [
      [t('Abrir'), () => api.openMap(id)],
      [t('Renombrar'), () => rename('map', id)],
      [t('Personalizar…'), () => picker(anchor, 'map', id)],
      [t('Duplicar'), () => api.duplicateMap(id)],
      [t('Mover a…'), () => moveMenu(anchor, 'map', id)],
      [t('Exportar o compartir…'), () => api.shareMap(id)],
      null,
      [t('Borrar mapa'), () => api.deleteMap(id), 'danger'],
    ]);
  }

  // ---------- Personalizar: color e icono ----------

  function picker(anchor, kind, id) {
    const x = kind === 'folder' ? folders.find((f) => f.id === id) : maps.find((m) => m.id === id);
    if (!x) return;
    const { SIDE_ICONS, SIDE_EMOJIS, esc } = api;
    const save = async (patch) => {
      Object.assign(x, patch);
      if (kind === 'folder') await api.Store.folders.put(x); else await api.setMapMeta(id, patch);
      render();
      draw();
    };
    const m = menu();
    const draw = () => {
      const tint = COLORS[x.color] || '';
      m.innerHTML = `<div class="pick-title">${t('Color')}</div><div class="pick-colors">` +
        `<button class="pick-color none${!x.color ? ' on' : ''}" data-color="" title="${t('Sin color')}"></button>` +
        Object.entries(COLORS).map(([k, c]) => `<button class="pick-color${x.color === k ? ' on' : ''}" data-color="${k}" style="background:${c}" title="${k}"></button>`).join('') +
        `</div><div class="pick-title">${t('Icono')}</div><div class="pick-icons"${tint ? ` style="color:${tint}"` : ''}>` +
        Object.entries(SIDE_ICONS).map(([k, svg]) => `<button class="pick-icon${x.icon === `svg:${k}` || (!x.icon && k === (kind === 'folder' ? 'folder' : 'map')) ? ' on' : ''}" data-icon="${k === (kind === 'folder' ? 'folder' : 'map') ? '' : `svg:${k}`}">${svg}</button>`).join('') +
        `</div><div class="pick-icons emojis">` +
        SIDE_EMOJIS.map((e) => `<button class="pick-icon${x.icon === e ? ' on' : ''}" data-icon="${esc(e)}">${esc(e)}</button>`).join('') + '</div>';
    };
    draw();
    m.classList.add('picker');
    m.hidden = false;
    // Al lado de su fila, fuera de la barra lateral, para ver el cambio mientras se elige.
    const row = list().querySelector(kind === 'folder' ? `[data-folder="${id}"]` : `[data-map="${id}"]`);
    const r = (row || anchor).getBoundingClientRect();
    const side = document.querySelector('#sidebar').getBoundingClientRect();
    m.style.left = `${Math.min(innerWidth - m.offsetWidth - 8, side.right + 8)}px`;
    m.style.top = `${Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.top - 8))}px`;
    m.onclick = (e) => {
      const c = e.target.closest('[data-color]');
      if (c) return save({ color: c.dataset.color || null });
      const i = e.target.closest('[data-icon]');
      if (i) { save({ icon: i.dataset.icon || null }); closeMenu(); }
    };
  }

  // ---------- Menú flotante ----------

  function openMenu(anchor, items, point) {
    const m = menu();
    m.classList.remove('picker');
    m.innerHTML = items.map((it, i) => (it ? `<button class="menu-item${it[2] ? ` ${it[2]}` : ''}" data-i="${i}">${api.esc(it[0])}</button>` : '<div class="menu-sep"></div>')).join('');
    m.hidden = false;
    const r = point ? { left: point.x, bottom: point.y, top: point.y } : anchor.getBoundingClientRect();
    let top = r.bottom + 4;
    if (top + m.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - m.offsetHeight - 4);
    m.style.left = `${Math.min(innerWidth - m.offsetWidth - 8, r.left)}px`;
    m.style.top = `${top}px`;
    m.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const fn = items[+b.dataset.i][1];
      closeMenu();
      fn();
    };
  }

  function closeMenu() { const m = menu(); if (m) m.hidden = true; }

  // ---------- Eventos ----------

  async function onClick(e) {
    const add = e.target.closest('[data-add]');
    if (add) { e.stopPropagation(); return api.createMap(add.dataset.add); }
    const mf = e.target.closest('[data-more-folder]');
    if (mf) { e.stopPropagation(); return folderMenu(mf, mf.dataset.moreFolder); }
    const mm = e.target.closest('[data-more-map]');
    if (mm) { e.stopPropagation(); return mapMenu(mm, mm.dataset.moreMap); }
    const fr = e.target.closest('[data-folder]');
    if (fr && !e.target.closest('input')) {
      const f = folders.find((x) => x.id === fr.dataset.folder);
      f.collapsed = !f.collapsed;
      await api.Store.folders.put(f);
      return render();
    }
    const mr = e.target.closest('[data-map]');
    if (mr && !e.target.closest('input') && mr.dataset.map !== api.currentId()) api.openMap(mr.dataset.map);
  }

  function onContext(e) {
    const fr = e.target.closest('[data-folder]');
    const mr = e.target.closest('[data-map]');
    if (!fr && !mr) {
      e.preventDefault();
      return openMenu(null, [[t('Nuevo mapa'), () => api.createMap(null)], [t('Nueva carpeta'), () => newFolder(null)]], { x: e.clientX, y: e.clientY });
    }
    e.preventDefault();
    const anchor = { getBoundingClientRect: () => ({ left: e.clientX, top: e.clientY, bottom: e.clientY }) };
    if (fr) folderMenu(anchor, fr.dataset.folder); else mapMenu(anchor, mr.dataset.map);
  }

  let dragged = null;
  function onDragStart(e) {
    const r = e.target.closest('.row');
    if (!r) return;
    dragged = r.dataset.folder ? { kind: 'folder', id: r.dataset.folder } : { kind: 'map', id: r.dataset.map };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragged.id);
  }

  function dropTarget(e) {
    const r = e.target.closest('.row');
    if (!r) return { folderId: null, el: null };
    if (r.dataset.folder) return { folderId: r.dataset.folder, el: r };
    const m = maps.find((x) => x.id === r.dataset.map);
    return { folderId: m ? m.folderId || null : null, el: null };
  }

  function onDragOver(e) {
    if (!dragged) return;
    e.preventDefault();
    list().querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
    const t = dropTarget(e);
    if (t.el) t.el.classList.add('drop');
    list().classList.toggle('drop-root', !t.folderId);
  }

  async function onDrop(e) {
    if (!dragged) return;
    e.preventDefault();
    list().classList.remove('drop-root');
    const { folderId } = dropTarget(e);
    const d = dragged;
    dragged = null;
    if (d.kind === 'folder') return moveFolder(d.id, folderId);
    await api.moveMap(d.id, folderId);
    if (folderId) expandTo(folderId);
    refresh();
  }

  root.MMSidebar = { init, refresh, folderPath, render };
})(window);
