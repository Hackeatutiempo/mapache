// Comentarios y menciones. Una chincheta en el tablero (suelta, o enganchada a un objeto o a un nodo, al que sigue)
// con su hilo de respuestas; el panel con los comentarios del tablero, y la bandeja con las menciones de todos.
// Los comentarios van en el documento (`doc.comments`): se guardan, se sincronizan y se fusionan como lo demás, pero
// tienen su propia capa y nunca salen en lo que se exporta. La parte sin DOM (menciones y bandeja) también la usa Node.
// SPDX-License-Identifier: AGPL-3.0-or-later
(function (root) {
  'use strict';

  // ---------- Menciones y bandeja (sin DOM) ----------

  // Para comparar nombres: sin tildes y en minúsculas.
  const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const WORD = /[\p{L}\p{N}_]/u;

  // Ids de quienes se mencionan con «@Nombre» en un texto. Los nombres largos van primero, así «@Ana María» no cuenta
  // también como «@Ana», y «@Ana» no es «@Anabel».
  function mentionIds(text, members) {
    let low = fold(text);
    const out = [];
    const list = (members || []).filter((m) => m && m.id && m.name).sort((a, b) => String(b.name).length - String(a.name).length);
    for (const m of list) {
      const tag = `@${fold(m.name)}`;
      for (let i = low.indexOf(tag); i >= 0; i = low.indexOf(tag, i + 1)) {
        const next = low[i + tag.length], prev = low[i - 1];
        if ((next !== undefined && WORD.test(next)) || (prev !== undefined && WORD.test(prev))) continue; // «bob@ana.com» no es una mención
        if (!out.includes(String(m.id))) out.push(String(m.id));
        low = low.slice(0, i) + ' '.repeat(tag.length) + low.slice(i + tag.length);
      }
    }
    return out;
  }

  // El comentario y cada respuesta, cada uno con una clave estable.
  function entriesOf(c) {
    const one = (x, replyId) => ({ key: replyId ? `${c.id}/${replyId}` : c.id, commentId: c.id, replyId: replyId || null,
      author: x.author || {}, text: String(x.text || ''), mentions: Array.isArray(x.mentions) ? x.mentions : [], createdAt: x.createdAt || 0 });
    return [one(c, null), ...Object.values(c.replies || {}).filter(Boolean).map((r) => one(r, r.id))];
  }

  // Menciones a `me` en todos los tableros ({ id, title, doc }), las más nuevas primero. Lo que escribe uno mismo no
  // cuenta. `byName`: sin cuentas (solo este navegador) también cuenta «@tu nombre», por ejemplo de tu agente de IA.
  function inbox(boards, me, { byName = false } = {}) {
    const out = [];
    if (!me || !me.id) return out;
    const self = byName && me.name ? [{ id: me.id, name: me.name }] : null;
    for (const b of boards || []) {
      const cs = b && b.doc && b.doc.comments;
      if (!cs || typeof cs !== 'object') continue;
      for (const c of Object.values(cs)) {
        if (!c || !c.id) continue;
        for (const e of entriesOf(c)) {
          if (e.author.id === me.id) continue;
          if (!e.mentions.includes(me.id) && !(self && mentionIds(e.text, self).length)) continue;
          out.push({ ...e, key: `${b.id}/${e.key}`, boardId: b.id, title: b.title || '', resolved: !!c.resolved });
        }
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  const pure = { mentionIds, entriesOf, inbox, fold };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ---------- Interfaz ----------

  const t = root.MMI18n.t;
  const I18n = root.MMI18n;
  const DRAFT = '__draft';
  // Colores de las iniciales (con texto blanco legible en los dos temas). Tú, sin cuentas: morado; tu agente: verde azulado.
  const AV = ['#7c3aed', '#2563eb', '#0f766e', '#15803d', '#a16207', '#c2410c', '#b91c1c', '#be185d'];
  const uid = () => crypto.randomUUID();
  const $ = (s) => document.querySelector(s);
  let api = null, UI = null, esc = (s) => String(s);
  let layer, card, panel, inboxEl, cBtn, bBtn, targetEl;
  const pins = new Map(); // id -> { el, sig }
  let openId = null; // hilo abierto
  let draft = null; // comentario nuevo aún sin enviar: { x, y, ref, dx, dy }
  let pinDrag = null;
  let boardId = null;
  let drawn = false; // este tablero ya se dibujó: las chinchetas nuevas entran con una pequeña animación
  let showResolved = false;
  let members = [];
  let sugg = null; // sugerencias de @: { start, end, list, i }
  let cardSig = '', panelSig = '';
  const replyDrafts = new Map(); // respuestas a medio escribir, por hilo
  const cache = new Map(); // tablero -> { id, title, doc: { comments } } (para la bandeja)
  let entries = [];

  const doc = () => (api ? api.getDoc() : null);
  const allComments = () => Object.values((doc() && doc().comments) || {}).filter((c) => c && c.id);
  const byNew = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
  const clip = (s, n = 40) => { const v = String(s || '').replace(/\s+/g, ' ').trim(); return v.length > n ? `${v.slice(0, n - 1)}…` : v; };

  // ---------- Quién eres y con quién ----------

  // Con cuentas (servidor de equipo), la persona que ha entrado; si no, un perfil de este navegador.
  function currentUser() {
    let s = null;
    try { s = api.Store.status(); } catch { s = null; }
    if (s && s.user && s.user.id) return { id: String(s.user.id), name: String(s.user.name || s.user.email || t('Yo')), color: s.user.color || null, team: true };
    return { id: 'local', name: api.pref('mindmap:name') || t('Yo'), color: null, team: false };
  }
  const authorOf = (me) => ({ id: me.id, name: me.name });

  function loadMembers() {
    let m = [];
    try { m = api.Store.members ? api.Store.members() : []; } catch { m = []; }
    if (m && typeof m.then === 'function') m.then((v) => { members = Array.isArray(v) ? v : []; }).catch(() => {});
    else members = Array.isArray(m) ? m : [];
    return members;
  }

  function colorFor(a) {
    if (!a) return AV[0];
    const m = members.find((x) => x && x.id === a.id);
    if (m && m.color) return m.color;
    if (a.id === 'agent') return '#0f766e';
    if (a.id === 'local') return '#7c3aed';
    let h = 0;
    for (const ch of String(a.id || a.name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return AV[h % AV.length];
  }
  const initial = (a) => ([...String((a && a.name) || '?').trim()][0] || '?').toUpperCase();
  const face = (a) => (a && a.id === 'agent' ? UI.sparkles : esc(initial(a)));
  const avatar = (a) => `<span class="cm-av" style="background:${colorFor(a)}">${face(a)}</span>`;
  const canDelete = (x) => { const me = currentUser(); return me.id === 'local' || !!(x && x.author && x.author.id === me.id); };

  // ---------- Textos ----------

  let rtf = null;
  function ago(ts) {
    if (!ts) return '';
    rtf = rtf || new Intl.RelativeTimeFormat(I18n.locale, { numeric: 'auto', style: 'short' });
    const s = (Date.now() - ts) / 1000;
    if (s < 45) return t('ahora');
    const m = Math.round(s / 60);
    if (m < 60) return rtf.format(-m, 'minute');
    const h = Math.round(m / 60);
    if (h < 24) return rtf.format(-h, 'hour');
    const d = Math.round(h / 24);
    if (d < 7) return rtf.format(-d, 'day');
    const same = new Date(ts).getFullYear() === new Date().getFullYear();
    return new Date(ts).toLocaleDateString(I18n.locale, { day: 'numeric', month: 'short', ...(same ? {} : { year: 'numeric' }) });
  }
  const fullDate = (ts) => (ts ? new Date(ts).toLocaleString(I18n.locale, { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const repliesLabel = (n) => (n === 1 ? t('1 respuesta') : t('{n} respuestas', { n }));

  // Texto de un comentario: escapado, con las menciones resaltadas y los enlaces pulsables.
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function richText(text, { links = true } = {}) {
    const names = new Set(members.map((m) => m && m.name).filter(Boolean));
    for (const c of allComments()) for (const e of entriesOf(c)) if (e.author.name) names.add(e.author.name);
    const alt = [...names].sort((a, b) => b.length - a.length).map(escRe);
    // Una @ en medio de una palabra (un correo) no es una mención.
    const re = new RegExp(`(https?:\\/\\/[^\\s<>"]*[^\\s<>".,;:!?)\\]'])|(?<![\\p{L}\\p{N}_])@(?:${alt.length ? `(?:${alt.join('|')})(?![\\p{L}\\p{N}_])|` : ''}` +
      '[\\p{L}\\p{N}_](?:[\\p{L}\\p{N}_.-]*[\\p{L}\\p{N}_])?)', 'giu');
    const s = String(text || '');
    let out = '', last = 0;
    for (const m of s.matchAll(re)) {
      out += esc(s.slice(last, m.index));
      if (m[1]) out += links ? `<a href="${esc(m[1])}" target="_blank" rel="noopener">${esc(m[1])}</a>` : esc(m[1]);
      else out += `<span class="cm-mention">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  function kindName(type) {
    switch (type) {
      case 'note': return t('Nota');
      case 'text': return t('Texto');
      case 'shape': return t('Forma');
      case 'sticker': return t('Sticker');
      case 'image': return t('Imagen');
      case 'video': return t('Vídeo');
      case 'table': return t('Tabla');
      case 'chart': return t('Gráfico');
      case 'section': return t('Sección');
      case 'ink': return t('Dibujo');
      default: return type || '';
    }
  }
  // A qué apunta un comentario, en pocas palabras.
  function refLabel(ref) {
    const d = doc();
    if (!ref || !d) return '';
    if (ref.startsWith('node:')) { const n = d.nodes[ref.slice(5)]; return n ? clip(api.plainText(n)) || t('Sin título') : ''; }
    const it = d.items[ref];
    if (!it) return '';
    if (it.type === 'section') return clip(it.name) || kindName('section');
    if (it.type === 'chart') return clip(it.title) || kindName('chart');
    if (it.type === 'sticker') return `${kindName('sticker')} ${it.emoji || ''}`.trim();
    if (Array.isArray(it.lines)) return clip(api.plainText(it)) || kindName(it.type);
    return kindName(it.type);
  }

  // ---------- Chinchetas ----------

  // Dónde está: si está enganchada a algo, lo sigue; si eso ya no está, se queda donde estaba.
  function pinPos(c) {
    if (c.ref) { const r = api.refRect(c.ref); if (r) return { x: r.x + (c.dx || 0), y: r.y + (c.dy || 0) }; }
    return { x: c.x || 0, y: c.y || 0 };
  }
  // Datos de posición para una chincheta en `p`, enganchada a lo que haya debajo (`tgt`, de targetAt).
  function place(p, tgt) {
    const x = Math.round(p.x), y = Math.round(p.y);
    return tgt ? { x, y, ref: tgt.ref, dx: Math.round(p.x - tgt.rect.x), dy: Math.round(p.y - tgt.rect.y) } : { x, y, ref: null };
  }

  function drawPin(id, c, p) {
    let rec = pins.get(id);
    if (!rec) {
      const el = document.createElement('div');
      el.className = 'cm-pin';
      el.dataset.cid = id;
      if (drawn) { el.classList.add('pop'); el.addEventListener('animationend', () => el.classList.remove('pop'), { once: true }); }
      layer.appendChild(el);
      rec = { el, sig: '' };
      pins.set(id, rec);
    }
    const n = Object.keys(c.replies || {}).length;
    const color = colorFor(c.author);
    const sig = [c.author && c.author.id, c.author && c.author.name, c.resolved, n, c.text, color].join('\u0001');
    if (sig !== rec.sig) {
      rec.sig = sig;
      const first = String(c.text || '').split('\n')[0];
      rec.el.innerHTML = `<div class="cm-bubble" style="--pc:${color}">${c.resolved ? UI.check : face(c.author)}${n ? `<span class="cm-count">${n}</span>` : ''}</div>` +
        (id === DRAFT ? '' : `<div class="cm-peek"><b>${esc((c.author && c.author.name) || '?')}</b><span>${esc(clip(first, 90))}</span>` +
          `${n || c.resolved ? `<small>${[n ? repliesLabel(n) : '', c.resolved ? t('Resuelto') : ''].filter(Boolean).join(' · ')}</small>` : ''}</div>`);
    }
    rec.el.classList.toggle('open', id === openId || id === DRAFT);
    rec.el.classList.toggle('resolved', !!c.resolved);
    rec.el.classList.toggle('dragging', !!(pinDrag && pinDrag.id === id && pinDrag.moved));
    rec.el.style.transform = `translate(${p.x}px, ${p.y}px) scale(var(--ik, 1))`;
  }

  function render() {
    const d = doc();
    if (!layer || !d) return;
    const m = api.getMap();
    const id = m ? m.id : null;
    if (id !== boardId) {
      // Otro tablero: se cierra lo que estuviera abierto.
      boardId = id;
      drawn = false;
      card.hidden = true;
      card.innerHTML = '';
      openId = null;
      draft = null;
      pinDrag = null;
      panelSig = '';
      noteLocal();
    }
    const list = allComments().filter((c) => !c.resolved || showResolved || c.id === openId);
    const want = new Set(list.map((c) => c.id));
    if (draft) want.add(DRAFT);
    for (const [k, rec] of pins) if (!want.has(k)) { rec.el.remove(); pins.delete(k); }
    for (const c of list) drawPin(c.id, c, pinDrag && pinDrag.id === c.id && pinDrag.moved ? pinDrag.at : pinPos(c));
    if (draft) drawPin(DRAFT, { id: DRAFT, author: authorOf(currentUser()), text: '', replies: {} }, pinPos(draft));
    drawn = true;
    if (openId && !(d.comments || {})[openId]) { closeCard({ force: true }); return; }
    updateCount();
    if (!card.hidden) { refreshCard(); placeCard(); }
    if (!panel.hidden) renderPanel();
  }

  // La capa sigue a la vista (como las del lienzo); las chinchetas mantienen su tamaño en pantalla.
  function onView() {
    if (!layer) return;
    const v = api.view;
    layer.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    layer.style.setProperty('--ik', String(1 / v.k));
    placeCard();
  }

  function drawTarget(tgt) {
    if (!tgt) { targetEl.hidden = true; return; }
    const r = tgt.rect;
    Object.assign(targetEl.style, { transform: `translate(${r.x - 5}px, ${r.y - 5}px)`, width: `${r.w + 10}px`, height: `${r.h + 10}px` });
    targetEl.hidden = false;
  }

  // Arrastrar una chincheta la mueve (y la engancha a lo que quede debajo); un clic abre o cierra su hilo.
  function onPinDown(e) {
    const pin = e.target.closest('.cm-pin');
    if (!pin || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const id = pin.dataset.cid;
    if (id === DRAFT) { focusCompose(); return; }
    const c = (doc().comments || {})[id];
    if (!c) return;
    pin.setPointerCapture(e.pointerId);
    const w = api.toWorld(e.clientX, e.clientY), p = pinPos(c);
    pinDrag = { id, sx: e.clientX, sy: e.clientY, off: { x: w.x - p.x, y: w.y - p.y }, moved: false, at: p };
  }
  function onPinMove(e) {
    if (!pinDrag) return;
    if (!pinDrag.moved && Math.hypot(e.clientX - pinDrag.sx, e.clientY - pinDrag.sy) < 4) return;
    pinDrag.moved = true;
    const w = api.toWorld(e.clientX, e.clientY);
    pinDrag.at = { x: Math.round(w.x - pinDrag.off.x), y: Math.round(w.y - pinDrag.off.y) };
    drawTarget(api.targetAt(pinDrag.at));
    render();
  }
  function onPinUp() {
    const d = pinDrag;
    pinDrag = null;
    drawTarget(null);
    if (!d) return;
    if (!d.moved) { render(); if (openId === d.id) closeCard(); else open(d.id); return; }
    const spot = place(d.at, api.targetAt(d.at));
    api.mutate(() => {
      const c = (doc().comments || {})[d.id];
      if (!c) return;
      Object.assign(c, spot);
      if (!spot.ref) { delete c.dx; delete c.dy; }
    });
    render();
  }

  // Al borrar objetos o nodos, sus comentarios se quedan donde estaban (sueltos). Se llama dentro del cambio.
  function detach(refs) {
    for (const c of allComments()) {
      if (!c.ref || !refs.has(c.ref)) continue;
      const p = pinPos(c);
      c.x = Math.round(p.x);
      c.y = Math.round(p.y);
      c.ref = null;
      delete c.dx;
      delete c.dy;
    }
  }

  // ---------- Hilo y comentario nuevo ----------

  const hb = (act, icon, tip, arg = '') => `<button class="cm-btn" data-cm="${act}" data-arg="${esc(arg)}" data-tip="${tip}" aria-label="${tip.split(' · ')[0]}">${icon}</button>`;
  const textArea = () => card.querySelector('.cm-compose textarea');
  const draftText = () => (draft && textArea() ? textArea().value.trim() : '');

  function startDraft(at, tgt) {
    if (!doc()) return;
    if (draftText()) { pulse(); return; }
    closeCard({ force: true });
    api.clearSelection();
    draft = place(at, tgt);
    loadMembers();
    api.setTool('select');
    buildCard('draft');
    render();
    focusCompose();
  }

  function open(cid, { center = false } = {}) {
    const c = doc() && (doc().comments || {})[cid];
    if (!c) { api.toast(t('Este comentario ya no existe')); return false; }
    if (draftText()) { pulse(); return false; }
    draft = null;
    openId = cid;
    api.clearSelection();
    loadMembers();
    if (center) centerOn(pinPos(c));
    buildCard('thread');
    render();
    return true;
  }

  // Cierra el hilo o el comentario nuevo. Un comentario a medio escribir no se pierde por un clic fuera.
  function closeCard({ force = false } = {}) {
    if (card.hidden) return true;
    if (!force && draftText()) { pulse(); return false; }
    card.hidden = true;
    card.innerHTML = '';
    openId = null;
    draft = null;
    sugg = null;
    render();
    return true;
  }

  async function escapeCompose() {
    if (card.dataset.mode !== 'draft') return closeCard({ force: true });
    if (!draftText()) return closeCard({ force: true });
    const ok = await api.uiConfirm(t('Se perderá lo que has escrito.'), { title: t('¿Descartar el comentario?'), ok: t('Descartar'), danger: true });
    if (ok) closeCard({ force: true }); else focusCompose();
  }

  function pulse() {
    card.classList.remove('pulse');
    void card.offsetWidth;
    card.classList.add('pulse');
    focusCompose();
  }
  function focusCompose() { requestAnimationFrame(() => { const ta = textArea(); if (ta && !card.hidden) ta.focus(); }); }

  function buildCard(mode) {
    const me = currentUser();
    const askName = mode === 'draft' && !me.team && !api.pref('mindmap:name');
    card.dataset.mode = mode;
    card.className = `cm-${mode}`;
    const hint = `${t('Enter para enviar · Shift + Enter, nueva línea')}${members.length > 1 ? ` · ${t('@ para mencionar')}` : ''}`;
    card.innerHTML = `<div class="cm-head"></div>${mode === 'thread' ? '<div class="cm-list"></div>' : ''}<div class="cm-compose">` +
      (askName ? `<input class="cm-name" maxlength="40" spellcheck="false" placeholder="${t('Tu nombre (para que se sepa quién comenta)')}" aria-label="${t('Tu nombre')}" />` : '') +
      `<div class="cm-input"><textarea rows="1" placeholder="${mode === 'draft' ? t('Escribe un comentario…') : t('Responder…')}" aria-label="${mode === 'draft' ? t('Comentario') : t('Responder')}"></textarea>` +
      `<button class="cm-send" data-cm="send" data-tip="${t('Enviar · Enter')}" aria-label="${t('Enviar')}" disabled>${UI.send}</button></div>` +
      `<div class="cm-suggest" hidden></div>${mode === 'draft' ? `<div class="cm-hint">${hint}</div>` : ''}</div>`;
    card.hidden = false;
    cardSig = '';
    sugg = null;
    if (mode === 'draft') {
      const where = draft && draft.ref ? refLabel(draft.ref) : '';
      card.querySelector('.cm-head').innerHTML = `<span class="cm-where">${where ? t('Nuevo comentario en «{name}»', { name: esc(where) }) : t('Nuevo comentario')}</span>` +
        `<span class="cm-tools">${hb('close', UI.close, t('Cerrar · Esc'))}</span>`;
    } else {
      textArea().value = replyDrafts.get(openId) || '';
      refreshCard(true);
    }
    syncCompose();
    placeCard();
  }

  function msg(x, reply) {
    const a = x.author || { id: '', name: '?' };
    const del = reply && canDelete(x) ? `<button class="cm-btn cm-mini" data-cm="del-reply" data-arg="${esc(x.id)}" data-tip="${t('Borrar respuesta')}" aria-label="${t('Borrar respuesta')}">${UI.close}</button>` : '';
    return `<div class="cm-msg${reply ? ' reply' : ''}">${avatar(a)}<div class="cm-body"><div class="cm-meta"><b>${esc(a.name || '?')}</b>` +
      `${a.id === 'agent' ? `<span class="cm-tag">${t('IA')}</span>` : ''}<time title="${esc(fullDate(x.createdAt))}">${esc(ago(x.createdAt))}</time>${del}</div>` +
      `<div class="cm-text">${richText(x.text)}</div></div></div>`;
  }

  function refreshCard(force = false) {
    if (card.hidden || card.dataset.mode !== 'thread') return;
    const c = doc() && (doc().comments || {})[openId];
    if (!c) { closeCard({ force: true }); return; }
    const where = c.ref ? refLabel(c.ref) : '';
    const sig = `${JSON.stringify(c)}|${where}|${Math.floor(Date.now() / 30000)}|${members.length}|${currentUser().id}`;
    if (!force && sig === cardSig) return;
    cardSig = sig;
    card.querySelector('.cm-head').innerHTML = `<span class="cm-where">${where ? t('En «{name}»', { name: esc(where) }) : t('Comentario')}</span><span class="cm-tools">` +
      (c.resolved ? hb('reopen', UI.reopen, t('Reabrir')) : hb('resolve', UI.check, t('Resolver'))) + hb('link', UI.link, t('Copiar enlace')) +
      (canDelete(c) ? hb('delete', UI.trash, t('Borrar el comentario')) : '') + `<span class="cm-sep"></span>${hb('close', UI.close, t('Cerrar · Esc'))}</span>`;
    card.querySelector('.cm-head [data-cm="resolve"]')?.classList.add('cm-ok');
    const list = card.querySelector('.cm-list');
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 8;
    const reps = Object.values(c.replies || {}).filter(Boolean).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    list.innerHTML = (c.resolved ? `<div class="cm-resolved">${UI.check}<span>${c.resolvedBy ? t('Resuelto por {name}', { name: esc(c.resolvedBy.name || '?') }) : t('Resuelto')}` +
      `${c.resolvedAt ? ` · ${esc(ago(c.resolvedAt))}` : ''}</span></div>` : '') + msg(c, false) + reps.map((r) => msg(r, true)).join('');
    if (atEnd || force) list.scrollTop = list.scrollHeight;
  }

  // Junto a su chincheta, a la derecha si cabe; nunca debajo del panel de comentarios.
  function placeCard() {
    if (!card || card.hidden) return;
    const c = openId && doc() ? (doc().comments || {})[openId] : null;
    const anchor = c ? pinPos(c) : draft ? pinPos(draft) : null;
    if (!anchor) return;
    const v = api.view, r = api.stageRect();
    const sx = anchor.x * v.k + v.x, sy = anchor.y * v.k + v.y;
    const w = card.offsetWidth, h = card.offsetHeight;
    const right = panel.hidden ? r.width - 12 : panel.offsetLeft - 12;
    let left = sx + 40;
    if (left + w > right) left = sx - w - 12;
    left = Math.max(12, Math.min(right - w, left));
    const top = Math.max(12, Math.min(r.height - h - 12, sy - 36));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  function centerOn(p) {
    const v = api.view, r = api.stageRect();
    if (v.k < 0.5) v.k = 1;
    const right = panel.hidden ? r.width : panel.offsetLeft;
    // La tarjeta se abre a la derecha de la chincheta: se deja sitio para ella.
    v.x = Math.round(right / 2 - 170 - p.x * v.k);
    v.y = Math.round(r.height * 0.42 - p.y * v.k);
    api.applyView();
  }

  function send() {
    const ta = textArea();
    const text = ta ? ta.value.trim().slice(0, 4000) : '';
    if (!text) return;
    const mentions = mentionIds(text, members);
    if (card.dataset.mode === 'draft' && draft) {
      const name = card.querySelector('.cm-name');
      if (name && name.value.trim()) api.pref('mindmap:name', name.value.trim().slice(0, 40));
      const author = authorOf(currentUser());
      const d = draft, id = uid(), p = pinPos(d);
      draft = null;
      api.mutate(() => {
        const dd = doc();
        dd.comments = dd.comments || {};
        const c = { id, x: Math.round(p.x), y: Math.round(p.y), ref: d.ref || null, author, text, mentions, createdAt: Date.now(), replies: {}, resolved: false };
        if (c.ref) { c.dx = d.dx; c.dy = d.dy; }
        dd.comments[id] = c;
      });
      openId = id;
      buildCard('thread');
      render();
    } else if (openId) {
      const cid = openId, rid = uid(), author = authorOf(currentUser());
      api.mutate(() => {
        const c = (doc().comments || {})[cid];
        if (!c) return;
        if (!c.replies || typeof c.replies !== 'object' || Array.isArray(c.replies)) c.replies = {};
        c.replies[rid] = { id: rid, author, text, mentions, createdAt: Date.now() };
        // Responder a un hilo resuelto lo vuelve a abrir.
        if (c.resolved) { c.resolved = false; delete c.resolvedBy; delete c.resolvedAt; }
      });
      ta.value = '';
      replyDrafts.delete(cid);
      syncCompose();
      refreshCard(true);
      ta.focus();
    }
    noteLocal();
  }

  function setResolved(id, on) {
    const me = currentUser();
    api.mutate(() => {
      const c = (doc().comments || {})[id];
      if (!c) return;
      c.resolved = on;
      if (on) { c.resolvedBy = authorOf(me); c.resolvedAt = Date.now(); } else { delete c.resolvedBy; delete c.resolvedAt; }
    });
    api.toast(on ? t('Comentario resuelto') : t('Comentario reabierto'));
    if (on && !showResolved) closeCard({ force: true });
    noteLocal();
  }

  async function removeComment(id) {
    if (!(await api.uiConfirm(t('Se borrará el comentario con sus respuestas.'), { title: t('¿Borrar el comentario?'), ok: t('Borrar'), danger: true }))) return;
    closeCard({ force: true });
    api.mutate(() => { delete (doc().comments || {})[id]; });
    noteLocal();
  }

  async function removeReply(cid, rid) {
    if (!(await api.uiConfirm(t('Se borrará esta respuesta.'), { title: t('¿Borrar la respuesta?'), ok: t('Borrar'), danger: true }))) return;
    api.mutate(() => { const c = (doc().comments || {})[cid]; if (c && c.replies) delete c.replies[rid]; });
    noteLocal();
  }

  // Enlace que abre este tablero centrado en la chincheta y con el hilo abierto.
  function copyLink(id) {
    const c = (doc().comments || {})[id], m = api.getMap();
    if (!c || !m) return;
    const p = pinPos(c);
    const url = `${location.origin}${location.pathname}#m=${encodeURIComponent(m.id)}&x=${Math.round(p.x)}&y=${Math.round(p.y)}&z=${Math.round(api.view.k * 100) / 100}&c=${encodeURIComponent(id)}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => api.toast(t('Enlace copiado')), () => api.toast(url));
    else api.toast(url);
  }

  // ---------- Escribir: tamaño, botón de enviar y @menciones ----------

  function syncCompose() {
    const ta = textArea();
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(140, ta.scrollHeight)}px`;
    const b = card.querySelector('.cm-send');
    if (b) b.disabled = !ta.value.trim();
  }

  function suggest() {
    const ta = textArea(), box = card.querySelector('.cm-suggest');
    if (!ta || !box) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(/(?:^|\s)@([^\s@]{0,30})$/u);
    const me = currentUser();
    const q = m ? fold(m[1]) : '';
    const list = m ? members.filter((x) => x && x.id && x.name && x.id !== me.id && fold(x.name).includes(q))
      .sort((a, b) => (fold(b.name).startsWith(q) ? 1 : 0) - (fold(a.name).startsWith(q) ? 1 : 0) || String(a.name).localeCompare(b.name)).slice(0, 6) : [];
    if (!list.length) { hideSuggest(); return; }
    sugg = { start: ta.selectionStart - m[1].length - 1, end: ta.selectionStart, list, i: sugg && sugg.list.length === list.length ? Math.min(sugg.i, list.length - 1) : 0 };
    drawSuggest();
  }
  function drawSuggest() {
    const box = card.querySelector('.cm-suggest');
    if (!box || !sugg) return;
    box.innerHTML = sugg.list.map((x, i) => `<button class="cm-sug${i === sugg.i ? ' on' : ''}" data-cm="pick" data-arg="${i}">${avatar(x)}<span>${esc(x.name)}</span></button>`).join('');
    box.hidden = false;
  }
  function hideSuggest() {
    sugg = null;
    const box = card.querySelector('.cm-suggest');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }
  function pick(i) {
    const ta = textArea();
    if (!ta || !sugg || !sugg.list[i]) return;
    const insert = `@${sugg.list[i].name} `;
    ta.value = ta.value.slice(0, sugg.start) + insert + ta.value.slice(sugg.end);
    const at = sugg.start + insert.length;
    hideSuggest();
    ta.focus();
    ta.setSelectionRange(at, at);
    syncCompose();
    if (card.dataset.mode === 'thread' && openId) replyDrafts.set(openId, ta.value);
  }

  function onCardKey(e) {
    if (e.target.matches('.cm-name')) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); textArea().focus(); } else if (e.key === 'Escape') { e.preventDefault(); escapeCompose(); }
      return;
    }
    if (!e.target.matches('textarea')) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); escapeCompose(); }
      return;
    }
    e.stopPropagation();
    if (sugg) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sugg.i = (sugg.i + (e.key === 'ArrowDown' ? 1 : -1) + sugg.list.length) % sugg.list.length; return drawSuggest(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pick(sugg.i); }
      if (e.key === 'Escape') { e.preventDefault(); return hideSuggest(); }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); return send(); }
    if (e.key === 'Escape') { e.preventDefault(); escapeCompose(); }
  }

  function onCardInput(e) {
    if (!e.target.matches('textarea')) return;
    syncCompose();
    suggest();
    if (card.dataset.mode === 'thread' && openId) replyDrafts.set(openId, e.target.value);
  }

  // ---------- Panel de comentarios del tablero ----------

  function buildPanel() {
    panel.innerHTML = `<div class="cm-phead"><h3>${t('Comentarios')}</h3><span class="cm-pcount"></span>` +
      `<button class="cm-btn" data-cm="panel-close" data-tip="${t('Cerrar · Esc')}" aria-label="${t('Cerrar')}">${UI.close}</button></div>` +
      `<label class="cm-switch"><input type="checkbox" class="cm-resolved-toggle" /><span>${t('Mostrar resueltos')}</span></label>` +
      '<div class="cm-plist"></div><div class="cm-pfoot"></div>';
  }

  function row(c) {
    const n = Object.keys(c.replies || {}).length;
    const where = c.ref ? refLabel(c.ref) : '';
    const foot = [where ? t('En «{name}»', { name: esc(clip(where, 30)) }) : '', n ? esc(repliesLabel(n)) : '', c.resolved ? t('Resuelto') : ''].filter(Boolean).join(' · ');
    const a = c.author || {};
    return `<button class="cm-row${c.id === openId ? ' on' : ''}${c.resolved ? ' done' : ''}" data-cm="goto" data-arg="${esc(c.id)}">${avatar(a)}` +
      `<span class="cm-rbody"><span class="cm-meta"><b>${esc(a.name || '?')}</b>${a.id === 'agent' ? `<span class="cm-tag">${t('IA')}</span>` : ''}<time>${esc(ago(c.createdAt))}</time></span>` +
      `<span class="cm-rtext">${richText(c.text, { links: false })}</span>${foot ? `<span class="cm-rfoot">${foot}</span>` : ''}</span></button>`;
  }

  function renderPanel(force = false) {
    const d = doc();
    if (!d || panel.hidden) return;
    const all = allComments();
    const me = currentUser();
    const sig = `${boardId}|${showResolved}|${openId}|${me.id}|${me.name}|${Math.floor(Date.now() / 30000)}|${all.map((c) => `${c.id}:${c.resolved ? 1 : 0}:${Object.keys(c.replies || {}).length}:${c.text}:${refLabel(c.ref)}`).join(',')}`;
    if (!force && sig === panelSig) return;
    panelSig = sig;
    const open = all.filter((c) => !c.resolved).sort(byNew), done = all.filter((c) => c.resolved).sort(byNew);
    panel.querySelector('.cm-pcount').textContent = open.length ? String(open.length) : '';
    panel.querySelector('.cm-resolved-toggle').checked = showResolved;
    const rows = [...open, ...(showResolved ? done : [])];
    const empty = !all.length
      ? `<div class="cm-empty">${UI.comment}<p>${t('Aún no hay comentarios en este tablero.')}</p><small>${t('Pulsa K y haz clic donde quieras comentar, o sobre un objeto.')}</small></div>`
      : `<div class="cm-empty">${UI.check}<p>${t('No hay comentarios abiertos.')}</p>${done.length && !showResolved ? `<button class="cm-link" data-cm="show-resolved">${t('Ver los resueltos ({n})', { n: done.length })}</button>` : ''}</div>`;
    panel.querySelector('.cm-plist').innerHTML = rows.length ? rows.map(row).join('') : empty;
    const foot = panel.querySelector('.cm-pfoot');
    foot.hidden = me.team;
    if (!me.team && !foot.querySelector('input')) {
      foot.innerHTML = `<span>${t('Comentas como {name}', { name: `<b>${esc(me.name)}</b>` })}</span><button class="cm-link" data-cm="rename">${t('Cambiar')}</button>`;
    }
  }

  function togglePanel(on = panel.hidden) {
    panel.hidden = !on;
    cBtn.classList.toggle('on', on);
    cBtn.setAttribute('aria-pressed', String(on));
    if (on) { loadMembers(); renderPanel(true); }
    placeCard();
  }

  function setShowResolved(v) {
    showResolved = !!v;
    api.pref('mindmap:comments-resolved', showResolved ? '1' : '0');
    panelSig = '';
    render();
  }

  function renameStart() {
    const foot = panel.querySelector('.cm-pfoot');
    foot.innerHTML = `<input class="cm-name" maxlength="40" spellcheck="false" value="${esc(currentUser().name)}" aria-label="${t('Tu nombre')}" />` +
      `<button class="cm-link" data-cm="rename-ok">${t('Guardar')}</button>`;
    const inp = foot.querySelector('input');
    inp.focus();
    inp.select();
  }
  function renameEnd(save) {
    const inp = panel.querySelector('.cm-pfoot input');
    if (!inp) return;
    if (save && inp.value.trim()) api.pref('mindmap:name', inp.value.trim().slice(0, 40));
    panel.querySelector('.cm-pfoot').innerHTML = '';
    renderPanel(true);
    recount();
  }

  async function goto(bid, cid) {
    if (bid && bid !== boardId) await api.openMap(bid);
    open(cid, { center: true });
  }

  // ---------- Bandeja de menciones ----------

  const seenKey = () => `mindmap:mentions-seen:${currentUser().id}`;
  function seenSet() { try { return new Set(JSON.parse(api.pref(seenKey()) || '[]')); } catch { return new Set(); } }
  function markSeen(keys) {
    const s = seenSet();
    for (const k of keys) s.add(k);
    api.pref(seenKey(), JSON.stringify([...s].slice(-2000)));
    updateBell();
    if (!inboxEl.hidden) renderInbox();
  }

  const boardInfo = (b) => {
    let title = '';
    try { title = api.titleOf(b); } catch { title = b.title || ''; }
    return { id: b.id, title, doc: { comments: JSON.parse(JSON.stringify((b.doc && b.doc.comments) || {})) } };
  };
  // El tablero abierto, con lo que hay en pantalla.
  function noteLocal() {
    const m = api.getMap(), d = doc();
    if (m && d) cache.set(m.id, boardInfo({ ...m, doc: d }));
    recount();
  }
  let scanTimer = null;
  function scanAllSoon() { clearTimeout(scanTimer); scanTimer = setTimeout(scanAll, 300); }
  async function scanAll() {
    try {
      const all = await api.Store.all();
      cache.clear();
      for (const b of all) if (b && b.id && b.doc) cache.set(b.id, boardInfo(b));
    } catch { /* sin datos todavía */ }
    noteLocal();
  }
  async function scanOne(id, deleted) {
    if (deleted) cache.delete(id);
    else {
      try { const b = await api.Store.get(id); if (b && b.doc) cache.set(id, boardInfo(b)); else cache.delete(id); } catch { /* en la próxima */ }
    }
    recount();
  }
  function recount() {
    const me = currentUser();
    entries = inbox([...cache.values()], me, { byName: !me.team && !!api.pref('mindmap:name') });
    updateBell();
    if (!inboxEl.hidden) renderInbox();
  }

  function setBadge(btn, n) {
    const b = btn.querySelector('.top-badge');
    const txt = n > 99 ? '99+' : n ? String(n) : '';
    if (b.textContent !== txt) b.textContent = txt;
    b.hidden = !n;
  }
  function updateCount() {
    const n = allComments().filter((c) => !c.resolved).length;
    setBadge(cBtn, n);
    cBtn.setAttribute('aria-label', n ? t('Comentarios: {n} abiertos', { n }) : t('Comentarios'));
  }
  function updateBell() {
    const me = currentUser();
    const seen = seenSet();
    const unread = entries.filter((x) => !seen.has(x.key)).length;
    bBtn.hidden = !(me.team || entries.length);
    setBadge(bBtn, unread);
    bBtn.setAttribute('aria-label', unread ? t('Menciones: {n} sin leer', { n: unread }) : t('Menciones'));
  }

  function renderInbox() {
    const seen = seenSet();
    const me = currentUser();
    const unread = entries.some((x) => !seen.has(x.key));
    const rows = entries.slice(0, 80).map((x) => `<button class="cm-irow${seen.has(x.key) ? '' : ' unread'}" data-cm="goto" data-board="${esc(x.boardId)}" data-arg="${esc(x.commentId)}" data-key="${esc(x.key)}">` +
      `${avatar(x.author)}<span class="cm-rbody"><span class="cm-meta"><span class="cm-who">${t('{name} te mencionó', { name: `<b>${esc(x.author.name || '?')}</b>` })}</span><time>${esc(ago(x.createdAt))}</time></span>` +
      `<span class="cm-rtext">${richText(x.text, { links: false })}</span><span class="cm-rfoot">${esc(x.title || t('Sin título'))}${x.resolved ? ` · ${t('Resuelto')}` : ''}</span></span></button>`).join('');
    inboxEl.innerHTML = `<div class="cm-ihead"><b>${t('Menciones')}</b>${unread ? `<button class="cm-link" data-cm="read-all">${t('Marcar todo como leído')}</button>` : ''}</div>` +
      (rows ? `<div class="cm-ilist">${rows}</div>` : `<div class="cm-empty">${UI.bell}<p>${t('No tienes menciones.')}</p><small>${t('Cuando alguien escriba @{name} en un comentario, aparecerá aquí.', { name: esc(me.name) })}</small></div>`);
  }

  function toggleInbox(on = inboxEl.hidden) {
    inboxEl.hidden = !on;
    bBtn.classList.toggle('on', on);
    if (!on) return;
    loadMembers();
    renderInbox();
    const a = bBtn.getBoundingClientRect();
    const w = inboxEl.offsetWidth;
    inboxEl.style.top = `${Math.round(a.bottom + 6)}px`;
    inboxEl.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - w - 8, a.right - w)))}px`;
  }

  // ---------- Esc, clics y arranque ----------

  // Esc cierra lo de comentarios que esté abierto (la bandeja, luego el hilo y luego el panel).
  function escape() {
    if (!inboxEl.hidden) { toggleInbox(false); return true; }
    if (!card.hidden) { escapeCompose(); return true; }
    if (!panel.hidden) { togglePanel(false); return true; }
    return false;
  }

  function onClick(e) {
    const b = e.target.closest('[data-cm]');
    if (!b || b.disabled) return;
    const arg = b.dataset.arg;
    switch (b.dataset.cm) {
      case 'send': return send();
      case 'close': return escapeCompose();
      case 'resolve': return setResolved(openId, true);
      case 'reopen': return setResolved(openId, false);
      case 'link': return copyLink(openId);
      case 'delete': return removeComment(openId);
      case 'del-reply': return removeReply(openId, arg);
      case 'pick': return pick(+arg);
      case 'goto':
        if (b.dataset.key) { markSeen([b.dataset.key]); toggleInbox(false); }
        return goto(b.dataset.board || boardId, arg);
      case 'panel-close': return togglePanel(false);
      case 'show-resolved': return setShowResolved(true);
      case 'rename': return renameStart();
      case 'rename-ok': return renameEnd(true);
      case 'read-all': return markSeen(entries.map((x) => x.key));
      default: return undefined;
    }
  }

  function init(a) {
    api = a;
    UI = a.UI;
    esc = a.esc;
    showResolved = a.pref('mindmap:comments-resolved') === '1';
    const stage = a.stage;
    layer = Object.assign(document.createElement('div'), { id: 'comments-layer', className: 'world-layer' });
    stage.insertBefore(layer, stage.querySelector('#toolbox'));
    targetEl = Object.assign(document.createElement('div'), { className: 'cm-target', hidden: true });
    layer.appendChild(targetEl);
    card = Object.assign(document.createElement('div'), { id: 'cm-card', hidden: true });
    card.setAttribute('role', 'dialog');
    panel = Object.assign(document.createElement('aside'), { id: 'cm-panel', hidden: true });
    panel.setAttribute('aria-label', t('Comentarios'));
    stage.append(card, panel);
    inboxEl = Object.assign(document.createElement('div'), { id: 'cm-inbox', className: 'floating-menu', hidden: true });
    document.body.appendChild(inboxEl);
    buildPanel();

    cBtn = $('#comments-btn');
    bBtn = $('#mentions-btn');
    cBtn.innerHTML = `${UI.comment}<span class="top-badge" hidden></span>`;
    bBtn.innerHTML = `${UI.bell}<span class="top-badge alert" hidden></span>`;
    cBtn.addEventListener('click', () => { togglePanel(); cBtn.blur(); });
    bBtn.addEventListener('click', () => { toggleInbox(); bBtn.blur(); });

    layer.addEventListener('pointerdown', onPinDown);
    layer.addEventListener('pointermove', onPinMove);
    layer.addEventListener('pointerup', onPinUp);
    layer.addEventListener('pointercancel', onPinUp);
    layer.addEventListener('contextmenu', (e) => {
      const pin = e.target.closest('.cm-pin');
      if (!pin) return;
      e.preventDefault();
      e.stopPropagation();
      if (pin.dataset.cid !== DRAFT && openId !== pin.dataset.cid) open(pin.dataset.cid);
    });

    for (const host of [card, panel]) {
      // Nada de lo de dentro llega al lienzo (ni arrastrar, ni la rueda, ni el menú del clic derecho).
      host.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!e.target.closest('textarea, input, label, .cm-text')) e.preventDefault(); });
      host.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
      host.addEventListener('contextmenu', (e) => e.stopPropagation());
      host.addEventListener('dblclick', (e) => e.stopPropagation());
      host.addEventListener('click', onClick);
    }
    card.addEventListener('keydown', onCardKey);
    card.addEventListener('input', onCardInput);
    card.addEventListener('click', (e) => { if (e.target.matches('textarea')) suggest(); });
    panel.addEventListener('change', (e) => { if (e.target.matches('.cm-resolved-toggle')) setShowResolved(e.target.checked); });
    panel.addEventListener('keydown', (e) => {
      if (!e.target.matches('.cm-name')) return;
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); renameEnd(true); } else if (e.key === 'Escape') { e.preventDefault(); renameEnd(false); }
    });
    inboxEl.addEventListener('pointerdown', (e) => e.preventDefault());
    inboxEl.addEventListener('click', onClick);

    // Un clic fuera cierra el hilo (salvo un comentario a medio escribir) y la bandeja.
    stage.addEventListener('pointerdown', (e) => {
      if (!card.hidden && !e.target.closest('#cm-card, .cm-pin, #cm-panel')) closeCard();
    }, true);
    document.addEventListener('pointerdown', (e) => {
      if (!inboxEl.hidden && !e.target.closest('#cm-inbox, #mentions-btn')) toggleInbox(false);
    }, true);
    window.addEventListener('resize', () => { if (!inboxEl.hidden) toggleInbox(true); });

    // Menciones nuevas en cualquier tablero: lo que cambia por fuera (otra persona, otra pestaña, tu agente).
    a.Store.on((e) => {
      if (!e) return;
      if (e.type === 'board' && e.id) scanOne(e.id, !!e.deleted);
      else if (e.type !== 'export' && e.type !== 'open') { scanAllSoon(); render(); }
    });
    // Los «hace 5 min» se ponen al día solos.
    setInterval(() => {
      if (!card.hidden) refreshCard();
      if (!panel.hidden) renderPanel();
      if (!inboxEl.hidden) renderInbox();
    }, 30000);
    scanAllSoon();
  }

  root.MMComments = {
    ...pure, init, render, onView, startDraft, open, detach, escape, togglePanel, toggleInbox, currentUser,
    close: () => closeCard({ force: true }),
    isOpen: () => !!card && !card.hidden,
    get openId() { return openId; },
    get entries() { return entries; },
    scan: scanAll,
  };
})(typeof window !== 'undefined' ? window : globalThis);
