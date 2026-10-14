// Operaciones sobre el documento de un tablero desde Node (línea de comandos y MCP): crear mapas mentales desde un
// esquema, añadir nodos, notas, formas, tablas, gráficos y conectores, y leerlo todo como texto.
// El formato es el mismo que guarda la app (ver DESIGN.md): `doc.nodes` (mapas mentales) y `doc.items` (lo demás).
// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const crypto = require('crypto');
const L = require('../src/layout.js');

const uid = () => crypto.randomUUID();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const NOTE_COLORS = ['purple', 'blue', 'teal', 'green', 'mustard', 'orange', 'red', 'pink', 'gray', 'white'];
const TEXT_COLORS = ['white', 'gray', 'purple', 'blue', 'green', 'yellow', 'orange', 'red'];
const SHAPE_COLORS = ['white', 'gray', ...L.PALETTE_ORDER.slice(0, 10)];
const SECTION_COLORS = ['gray', 'purple', 'blue', 'green', 'yellow', 'orange', 'red', 'pink'];
const SHAPES = { rect: [160, 100], pill: [160, 64], oval: [120, 120], diamond: [140, 140], parallelogram: [170, 100],
  parallelogram2: [170, 100], trapezoid: [170, 100], triangle: [130, 110], hexagon: [160, 110], cylinder: [120, 140], cloud: [190, 130], star: [130, 125] };
const SHAPE_STYLES = ['fill', 'border', 'dashed', 'none'];
const CHARTS = ['column', 'column-stacked', 'column-100', 'bar', 'bar-stacked', 'line', 'area', 'area-stacked', 'pie', 'donut',
  'scatter', 'bubble', 'radar', 'funnel', 'heatmap', 'waterfall', 'stat'];
const TEXT_SIZES = ['S', 'M', 'L', 'XL'];
const BRANCH_COLORS = Object.keys(L.PALETTE);

const fail = (msg) => { throw Object.assign(new Error(msg), { status: 400 }); };
const pick = (v, list, name, def) => {
  if (v == null || v === '') return def;
  if (!list.includes(v)) fail(`Unknown ${name} "${v}". Use one of: ${list.join(', ')}`);
  return v;
};

// ---------- Texto: Markdown sencillo <-> líneas HTML de la app ----------

// Negrita, cursiva, tachado, código y enlaces dentro de una línea (el resto se escapa).
function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<i>$2</i>');
  out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, t, u) => `<a href="${u.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${t}</a>`);
  return out;
}

const BLOCK_MD = [[/^###\s+/, 'h3'], [/^##\s+/, 'h2'], [/^#\s+/, 'h1'], [/^\[( |x|X)\]\s+/, 'check'], [/^[-*•]\s+/, 'ul'], [/^\d+[.)]\s+/, 'ol']];

// Texto (con saltos de línea) -> { lines, block, blocks?, checked }.
function textToLines(text, { blocks: allowBlocks = true } = {}) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const lines = [], blocks = [], checked = [];
  for (const r of raw) {
    let line = r, b = 'p', done = false;
    if (allowBlocks) {
      for (const [re, kind] of BLOCK_MD) {
        const m = line.match(re);
        if (m) { b = kind; done = kind === 'check' && /x/i.test(m[1] || ''); line = line.slice(m[0].length); break; }
      }
    }
    lines.push(inline(line));
    blocks.push(b);
    checked.push(done);
  }
  const out = { lines: lines.length ? lines : [''], block: blocks[0] || 'p', checked: checked.some(Boolean) ? checked : [] };
  if (blocks.some((b) => b !== blocks[0])) out.blocks = blocks;
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e] ?? m;
});

// Línea HTML -> Markdown sencillo (lo que lee un agente).
function htmlToText(html, md = true) {
  let s = String(html || '').replace(/<br\s*\/?>/gi, '\n');
  if (md) {
    s = s.replace(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_, u, t) => `[${t}](${u})`);
    s = s.replace(/<(b|strong)>(.*?)<\/\1>/gi, '**$2**').replace(/<(i|em)>(.*?)<\/\1>/gi, '*$2*')
      .replace(/<(s|del|strike)>(.*?)<\/\1>/gi, '~~$2~~').replace(/<code>(.*?)<\/code>/gi, '`$1`');
  }
  return decode(s.replace(/<[^>]+>/g, ''));
}

const blockAt = (t, i) => (t.blocks && t.blocks[i]) || t.block || 'p';
const MD_PREFIX = { h1: '# ', h2: '## ', h3: '### ', ul: '- ', ol: '1. ', p: '' };
function linesToText(t, md = true) {
  if (!t || !Array.isArray(t.lines)) return '';
  return t.lines.map((l, i) => {
    const b = blockAt(t, i);
    const pre = !md ? '' : b === 'check' ? (t.checked && t.checked[i] ? '[x] ' : '[ ] ') : MD_PREFIX[b] || '';
    return pre + htmlToText(l, md);
  }).join('\n');
}
const plain = (t) => linesToText(t, false).replace(/\s+/g, ' ').trim();

// ---------- Mapas mentales ----------

const kidsOf = (d, id) => Object.values(d.nodes).filter((n) => n.parentId === id).sort((a, b) => a.order - b.order);
const rootIdsOf = (d) => [d.rootId, ...Object.keys(d.nodes).filter((id) => id !== d.rootId && d.nodes[id].parentId == null)];
function rootOf(d, id) {
  let n = d.nodes[id];
  while (n && n.parentId != null && d.nodes[n.parentId]) n = d.nodes[n.parentId];
  return n ? n.id : d.rootId;
}
const depthOf = (d, id) => { let k = 0, n = d.nodes[id]; while (n && n.parentId != null) { k++; n = d.nodes[n.parentId]; } return k; };

// Color de rama: el menos usado entre los hijos de la raíz (como la app).
function nextColor(d, rid) {
  const used = {};
  for (const c of kidsOf(d, rid)) used[c.style && c.style.color] = (used[c.style && c.style.color] || 0) + 1;
  let best = L.PALETTE_ORDER[0];
  for (const key of L.PALETTE_ORDER) if ((used[key] || 0) < (used[best] || 0)) best = key;
  return best;
}

function makeNode(parentId, order, text) {
  const t = textToLines(text);
  return { id: uid(), parentId, order, ...t, icon: null, style: {} };
}

function newDoc(rootText = 'Idea central') {
  const root = makeNode(null, 1, rootText);
  return { rootId: root.id, settings: { layout: 'horizontal', lines: 'curvy', origin: { x: 0, y: 0 } }, nodes: { [root.id]: root }, items: {} };
}

// Esquema con sangría -> árbol. Acepta viñetas (-, *, 1.) y sangría con espacios o tabuladores.
function parseOutline(text) {
  const rows = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
    .map((l) => l.replace(/\t/g, '    '))
    .filter((l) => l.trim())
    .map((l) => {
      const indent = l.match(/^ */)[0].length;
      const body = l.trim().replace(/^([-*•+]|\d+[.)])\s+/, '');
      return { indent, text: body };
    });
  const top = [];
  const stack = [{ indent: -1, children: top }];
  for (const r of rows) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= r.indent) stack.pop();
    const node = { text: r.text, children: [], indent: r.indent };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  const clean = (list) => list.map((n) => ({ text: n.text, children: clean(n.children) }));
  return clean(top);
}

// Añade ramas (árbol { text, children }) bajo un nodo. Devuelve los ids nuevos en orden.
function addTree(d, parentId, tree, { position } = {}) {
  if (!d.nodes[parentId]) fail(`Node not found: ${parentId}`);
  const ids = [];
  const parent = d.nodes[parentId];
  if (parent.style) delete parent.style.collapsed;
  (function add(pid, list, pos) {
    const sibs = kidsOf(d, pid);
    let order;
    if (pos != null && pos < sibs.length) {
      const before = sibs[pos - 1], after = sibs[pos];
      const lo = before ? before.order : after.order - 1, hi = after.order;
      list.forEach((n, i) => { const o = lo + ((hi - lo) * (i + 1)) / (list.length + 1); add1(pid, n, o); });
      return;
    }
    order = sibs.length ? sibs[sibs.length - 1].order : 0;
    for (const n of list) add1(pid, n, ++order);
  })(parentId, tree, position);
  function add1(pid, n, order) {
    const node = makeNode(pid, order, n.text);
    if (d.nodes[pid].parentId == null) node.style.color = nextColor(d, pid);
    d.nodes[node.id] = node;
    ids.push(node.id);
    let o = 0;
    for (const c of n.children || []) add1(node.id, c, ++o);
  }
  return ids;
}

function subtreeIds(d, id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of kidsOf(d, out[i])) out.push(c.id);
  return out;
}

// ---------- Medidas aproximadas (para colocar cosas nuevas sin taparse) ----------

const CHAR = 0.56; // ancho medio de un carácter respecto al tamaño de letra
function textBox(text, size, lineH, maxW) {
  const rows = String(text || ' ').split('\n');
  let w = 0, h = 0;
  for (const r of rows) {
    const tw = Math.max(size, r.length * size * CHAR);
    w = Math.max(w, Math.min(maxW, tw));
    h += Math.max(1, Math.ceil(tw / maxW)) * lineH;
  }
  return { w, h };
}

function nodeSize(d, id) {
  const st = L.levelStyle(depthOf(d, id));
  const t = textBox(linesToText(d.nodes[id], false), st.size, st.line, st.maxText);
  return { w: Math.round(t.w + st.padX * 2 + 4), h: Math.round(t.h + st.padY * 2) };
}

function mapSettings(d, rid) {
  if (rid === d.rootId) return { layout: 'horizontal', lines: 'curvy', ...d.settings, origin: (d.settings && d.settings.origin) || { x: 0, y: 0 } };
  const m = d.nodes[rid].map || {};
  return { layout: 'horizontal', lines: 'curvy', ...m, origin: m.origin || { x: 0, y: 0 } };
}

function mapBounds(d, rid) {
  const s = mapSettings(d, rid);
  const lay = L.computeLayout({ rootId: rid, settings: s, nodes: d.nodes }, (id) => nodeSize(d, id));
  return { x: lay.bounds.x + s.origin.x, y: lay.bounds.y + s.origin.y, w: lay.bounds.w, h: lay.bounds.h };
}

function itemBounds(it) {
  if (!it || it.type === 'conn') return null;
  const lineText = linesToText(it, false);
  switch (it.type) {
    case 'note': return { x: it.x, y: it.y, w: it.w || 220, h: Math.max(it.h || 220, textBox(lineText, 18, 26, (it.w || 220) - 40).h + 40) };
    case 'text': { const [s, lh] = { S: [14, 20], M: [18, 26], L: [28, 36], XL: [44, 52] }[it.size || 'M']; const t = textBox(lineText, s, lh, 600); return { x: it.x, y: it.y, w: it.w || t.w + 8, h: t.h + 8 }; }
    case 'sticker': return { x: it.x, y: it.y, w: (it.size || 72) + 8, h: (it.size || 72) + 8 };
    case 'table': return { x: it.x, y: it.y, w: (it.cols || []).reduce((a, b) => a + b, 0) || 280, h: (it.rows || []).length * 34 + 2 };
    case 'ink': { const xs = (it.pts || []).map((p) => p[0]), ys = (it.pts || []).map((p) => p[1]); return { x: it.x, y: it.y, w: Math.max(1, ...xs) * (it.scale || 1), h: Math.max(1, ...ys) * (it.scale || 1) }; }
    case 'image': return { x: it.x, y: it.y, w: it.w || 320, h: it.h || Math.round((it.w || 320) * 0.66) };
    default: return { x: it.x, y: it.y, w: it.w || 160, h: it.h || 100 };
  }
}

function union(rects) {
  const rs = rects.filter(Boolean);
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}

function contentBounds(d) {
  return union([...rootIdsOf(d).map((r) => mapBounds(d, r)), ...Object.values(d.items || {}).map(itemBounds)]);
}

const overlaps = (a, b, gap = 40) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
function occupied(d) {
  return [...rootIdsOf(d).map((r) => mapBounds(d, r)), ...Object.values(d.items || {}).map(itemBounds)].filter(Boolean);
}

// Sitio libre para un bloque w × h (o donde se pida). Se prueba a la derecha de todo y debajo de todo, y se elige
// el que deja el tablero más compacto (cerca de la forma de una pantalla), para que se vea bien al encajarlo.
function freeSpot(d, w, h, at) {
  const taken = occupied(d);
  if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) return nudge(d, { x: at.x, y: at.y, w, h });
  const cb = union(taken);
  if (!cb) return { x: -Math.round(w / 2), y: -Math.round(h / 2) };
  const GAP = 140;
  const slide = (x, y, dx, dy) => {
    for (let i = 0; i < 80; i++) {
      const r = { x: x + dx * i, y: y + dy * i, w, h };
      if (!taken.some((t) => overlaps(r, t))) return r;
    }
    return { x, y, w, h };
  };
  // Primero se intenta encajar en el hueco junto a lo último de cada fila o columna; si no, al borde.
  const cands = [slide(cb.x + cb.w + GAP, cb.y, 0, 60), slide(cb.x, cb.y + cb.h + GAP, 60, 0)];
  for (const t of taken) cands.push(slide(t.x + t.w + GAP, t.y, 0, 60), slide(t.x, t.y + t.h + GAP, 60, 0));
  const score = (r) => {
    const u = union([cb, r]);
    return Math.abs(Math.log(u.w / u.h / 1.6)) + (u.w * u.h) / (cb.w * cb.h) * 0.35;
  };
  let best = cands[0];
  for (const c of cands) if (score(c) < score(best) - 1e-9) best = c;
  return { x: Math.round(best.x), y: Math.round(best.y) };
}

// Un sitio pedido a mano (x, y) se respeta salvo que tape algo: entonces baja hasta el primer hueco libre.
// Dentro de una sección sí se puede poner (es para eso).
function nudge(d, r) {
  const taken = [...rootIdsOf(d).map((id) => mapBounds(d, id)), ...Object.values(d.items || {}).filter((i) => i.type !== 'section').map(itemBounds)].filter(Boolean);
  for (let i = 0; i < 120; i++) {
    const c = { ...r, y: r.y + i * 40 };
    if (!taken.some((t) => overlaps(c, t, 24))) return { x: Math.round(c.x), y: Math.round(c.y) };
  }
  return { x: Math.round(r.x), y: Math.round(r.y) };
}

const topZ = (d) => Object.values(d.items || {}).reduce((m, it) => Math.max(m, it.z || 0), 0) + 1;

// ---------- Objetos del lienzo ----------

// spec: { type, text, color, shape, style, size, rows, name, w, h, x, y, emoji, url, table, kind, title }
function buildItem(d, spec) {
  const type = spec.type;
  const base = { id: uid(), type, x: 0, y: 0, z: topZ(d) };
  let it;
  if (type === 'note') it = { ...base, w: 220, h: 220, color: pick(spec.color, NOTE_COLORS, 'note color', 'purple'), ...textToLines(spec.text) };
  else if (type === 'text') it = { ...base, size: pick(spec.size, TEXT_SIZES, 'text size', 'M'), color: pick(spec.color, TEXT_COLORS, 'text color', 'white'), ...textToLines(spec.text) };
  else if (type === 'shape') {
    const kind = pick(spec.shape, Object.keys(SHAPES), 'shape', 'rect');
    const [w, h] = SHAPES[kind];
    it = { ...base, shape: kind, w: spec.w || w, h: spec.h || h, color: pick(spec.color, SHAPE_COLORS, 'shape color', 'purple'),
      style: pick(spec.style, SHAPE_STYLES, 'shape style', 'border'), rot: 0, ...textToLines(spec.text, { blocks: false }) };
  } else if (type === 'section') {
    const n = Object.values(d.items).filter((x) => x.type === 'section').length + 1;
    it = { ...base, z: 0, w: spec.w || 640, h: spec.h || 420, color: pick(spec.color, SECTION_COLORS, 'section color', 'gray'), fill: false, name: String(spec.name || spec.text || `Section ${n}`) };
  } else if (type === 'sticker') it = { ...base, size: 72, emoji: String(spec.emoji || spec.text || '⭐').slice(0, 8) };
  else if (type === 'table') {
    const rows = spec.rows;
    if (!Array.isArray(rows) || !rows.length || !rows.every(Array.isArray)) fail('A table needs "rows": an array of rows, each an array of cells (the first row is the header)');
    const nc = Math.min(50, Math.max(...rows.map((r) => r.length)));
    const cells = rows.slice(0, 500).map((r) => Array.from({ length: nc }, (_, c) => esc(r[c] == null ? '' : String(r[c]))));
    const cols = cells[0].map((_, c) => Math.max(90, Math.min(260, Math.max(...cells.map((r) => htmlToText(r[c], false).length)) * 8 + 28)));
    it = { ...base, rows: cells, cols, header: true, striped: cells.length > 6, color: 'gray' };
  } else if (type === 'chart') {
    const t = spec.table && d.items[spec.table];
    if (!t || t.type !== 'table') fail('A chart needs "table": the id of a table on this board (create the table first)');
    it = { ...base, tableId: t.id, kind: pick(spec.kind, CHARTS, 'chart kind', 'column'), w: spec.w || 540, h: spec.h || 360, title: String(spec.title || ''), labelCol: null, seriesCols: null, showValues: null };
  } else if (type === 'video') {
    const v = videoEmbed(spec.url);
    if (!v) fail('A video needs "url": a YouTube, Vimeo or Loom link, or a direct .mp4/.webm/.mov link');
    it = { ...base, w: spec.w || 560, h: spec.h || 315, mediaId: null, url: v.url || null, embed: v.embed || null, name: String(spec.name || '') };
  } else fail(`Unknown item type "${type}". Use note, text, shape, section, sticker, table, chart or video`);
  return it;
}

function videoEmbed(text) {
  try {
    const u = new URL(String(text || '').trim());
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

// Coloca varios objetos nuevos juntos en un hueco libre: en fila, y en varias filas si son muchos.
function addItems(d, specs, { x, y } = {}) {
  const built = specs.map((s) => [s, buildItem(d, s)]);
  const placed = built.filter(([s]) => !(Number.isFinite(s.x) && Number.isFinite(s.y)));
  const cols = Math.min(placed.length, Math.max(1, Math.ceil(Math.sqrt(placed.length * 1.6))));
  const sizes = placed.map(([, it]) => itemBounds(it));
  // Las formas llevan más aire entre sí (suelen ir conectadas con flechas).
  const GAP = placed.some(([, it]) => it.type === 'shape') ? 90 : 40;
  const colW = Math.max(0, ...sizes.map((s) => s.w)) + GAP;
  const rowsH = [];
  sizes.forEach((s, i) => { const r = Math.floor(i / cols); rowsH[r] = Math.max(rowsH[r] || 0, s.h); });
  const W = cols * colW - GAP, H = rowsH.reduce((a, b) => a + b + GAP, -GAP);
  const at = freeSpot(d, W, H, Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null);
  let z = topZ(d);
  placed.forEach(([, it], i) => {
    const r = Math.floor(i / cols), c = i % cols;
    // Centrados en su celda: así las flechas entre formas de distinto tamaño salen rectas.
    it.x = Math.round(at.x + c * colW + (colW - GAP - sizes[i].w) / 2);
    it.y = Math.round(at.y + rowsH.slice(0, r).reduce((a, b) => a + b + GAP, 0) + (rowsH[r] - sizes[i].h) / 2);
  });
  const ids = [];
  for (const [s, it] of built) {
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) { const b = itemBounds({ ...it, x: s.x, y: s.y }); Object.assign(it, nudge(d, b)); }
    if (it.type !== 'section') it.z = z++;
    d.items[it.id] = it;
    ids.push(it.id);
  }
  return ids;
}

// Mapa mental nuevo en el tablero (un esquema: la primera línea es la idea central).
function addMindmap(d, outline, { x, y, layout, lines } = {}) {
  const tree = parseOutline(outline);
  if (!tree.length) fail('The outline is empty');
  const rootSpec = tree.length === 1 ? tree[0] : { text: 'Idea central', children: tree };
  const root = makeNode(null, 1, rootSpec.text);
  root.map = { layout: pick(layout, ['horizontal', 'vertical'], 'layout', 'horizontal'), lines: pick(lines, ['curvy', 'angular'], 'lines', 'curvy'), origin: { x: 0, y: 0 } };
  d.nodes[root.id] = root;
  const ids = [root.id, ...addTree(d, root.id, rootSpec.children)];
  // Se mide ya colocado en (0,0) y se mueve a un hueco libre.
  const b = mapBounds(d, root.id);
  const others = { ...d, nodes: Object.fromEntries(Object.entries(d.nodes).filter(([id]) => !ids.includes(id))) };
  const spot = freeSpot(others, b.w, b.h, Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null);
  root.map.origin = { x: Math.round(spot.x - b.x), y: Math.round(spot.y - b.y) };
  return ids;
}

// ---------- Buscar nodos y objetos por id o por su texto ----------

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function findNode(d, ref) {
  if (ref == null || ref === '') fail('Missing node reference');
  const r = String(ref).replace(/^node:/, '');
  if (d.nodes[r]) return r;
  if (/^(root|central)$/i.test(r)) return d.rootId;
  // Ruta: "Idea central > Rama > Subrama".
  if (r.includes(' > ')) {
    const parts = r.split(' > ').map(norm);
    let cands = rootIdsOf(d).filter((id) => norm(plain(d.nodes[id])) === parts[0]);
    for (const p of parts.slice(1)) cands = cands.flatMap((id) => kidsOf(d, id).filter((k) => norm(plain(k)) === p).map((k) => k.id));
    if (cands.length === 1) return cands[0];
    if (cands.length > 1) fail(`Several nodes match "${ref}": ${cands.join(', ')}. Use an id`);
  }
  const exact = Object.values(d.nodes).filter((n) => norm(plain(n)) === norm(r));
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) fail(`Several nodes are called "${ref}": ${exact.map((n) => `${n.id} (under "${plain(d.nodes[n.parentId] || {})}")`).join(', ')}. Use the id`);
  const part = Object.values(d.nodes).filter((n) => norm(plain(n)).includes(norm(r)));
  if (part.length === 1) return part[0].id;
  fail(part.length ? `Several nodes contain "${ref}": ${part.slice(0, 8).map((n) => `${n.id} "${plain(n)}"`).join(', ')}. Use the id` : `No node matches "${ref}". Read the board to see node ids`);
}

const itemLabel = (it) => (it.type === 'section' ? it.name : it.type === 'chart' ? it.title : it.type === 'table' ? (it.rows || []).flat().map((c) => htmlToText(c, false)).join(' ') : plain(it));

function findItem(d, ref) {
  if (ref == null || ref === '') fail('Missing item reference');
  const r = String(ref);
  if (d.items[r]) return r;
  const list = Object.values(d.items).filter((it) => it.type !== 'conn' && it.type !== 'ink');
  const exact = list.filter((it) => norm(itemLabel(it)) === norm(r));
  if (exact.length === 1) return exact[0].id;
  const part = exact.length ? exact : list.filter((it) => norm(itemLabel(it)).includes(norm(r)));
  if (part.length === 1) return part[0].id;
  fail(part.length ? `Several items match "${ref}": ${part.slice(0, 8).map((it) => `${it.id} (${it.type})`).join(', ')}. Use the id` : `No item matches "${ref}". Read the board to see item ids`);
}

// Extremo de un conector: nodo o objeto, por id o texto.
function findEnd(d, ref) {
  const r = String(ref || '');
  if (r.startsWith('node:') || d.nodes[r]) return { ref: `node:${findNode(d, r)}`, side: 'auto' };
  if (d.items[r]) return { ref: r, side: 'auto' };
  let item = null, node = null;
  try { item = findItem(d, r); } catch { /* puede ser un nodo */ }
  if (item) return { ref: item, side: 'auto' };
  try { node = findNode(d, r); } catch (e) { fail(`Nothing called "${ref}" on this board (looked at nodes and items)`); }
  return { ref: `node:${node}`, side: 'auto' };
}

function connect(d, from, to, { label = '', route = 'elbow', style = 'solid', endCap = 'arrow', startCap = 'none', color = null } = {}) {
  const a = findEnd(d, from), b = findEnd(d, to);
  const id = uid();
  d.items[id] = { id, type: 'conn', z: 0, from: a, to: b, route: pick(route, ['elbow', 'curved', 'straight'], 'route', 'elbow'), color,
    style: pick(style, ['solid', 'dashed'], 'line style', 'solid'), startCap, endCap, label: String(label || ''), labelT: 0.5, mid: null };
  return id;
}

// Al borrar algo, sus conectores se quitan también (desde aquí no hay posición en pantalla donde dejarlos).
function dropConnsTo(d, refs) {
  for (const c of Object.values(d.items)) if (c.type === 'conn' && (refs.has(c.from.ref) || refs.has(c.to.ref))) delete d.items[c.id];
}

function deleteNodes(d, ids) {
  const gone = new Set();
  for (const id of ids) {
    if (!d.nodes[id]) continue;
    if (id === d.rootId) fail('The central idea of the main mind map cannot be deleted (rename it instead, or delete the board)');
    for (const x of subtreeIds(d, id)) gone.add(x);
  }
  for (const id of gone) delete d.nodes[id];
  dropConnsTo(d, new Set([...gone].map((id) => `node:${id}`)));
  return [...gone];
}

function deleteItems(d, ids) {
  for (const id of ids) delete d.items[id];
  dropConnsTo(d, new Set(ids));
  return ids;
}

function moveNode(d, id, parentId, position) {
  if (id === d.rootId) fail('The central idea cannot be moved under another node');
  if (subtreeIds(d, id).includes(parentId)) fail('A node cannot be moved inside its own branch');
  const n = d.nodes[id];
  const sibs = kidsOf(d, parentId).filter((k) => k.id !== id);
  const pos = position == null ? sibs.length : Math.max(0, Math.min(sibs.length, position));
  const before = sibs[pos - 1], after = sibs[pos];
  n.parentId = parentId;
  n.order = before && after ? (before.order + after.order) / 2 : before ? before.order + 1 : after ? after.order - 1 : 1;
  if (d.nodes[parentId].parentId == null) { if (!n.style.color) n.style.color = nextColor(d, parentId); }
  else { delete n.style.color; delete n.style.side; }
  if (n.map) delete n.map;
}

// ---------- Leer un tablero como texto ----------

function outlineOf(d, rid, withIds = true) {
  const out = [];
  (function walk(id, depth) {
    const n = d.nodes[id];
    const text = linesToText(n).split('\n');
    const meta = [withIds ? `id:${id}` : '', n.icon ? `icon:${n.icon}` : '', n.style && n.style.color && depth === 1 ? `color:${n.style.color}` : '',
      n.style && n.style.collapsed ? 'collapsed' : ''].filter(Boolean).join(' ');
    out.push(`${'  '.repeat(depth)}- ${text[0]}${text.length > 1 ? ` ${text.slice(1).join(' / ')}` : ''}${meta ? `  {${meta}}` : ''}`);
    for (const c of kidsOf(d, id)) walk(c.id, depth + 1);
  })(rid, 0);
  return out.join('\n');
}

function describeItem(d, it) {
  const pos = `x:${Math.round(it.x || 0)} y:${Math.round(it.y || 0)}`;
  const txt = (s) => s.split('\n').map((l, i) => (i ? `    ${l}` : l)).join('\n');
  switch (it.type) {
    case 'note': return `- Note {id:${it.id} color:${it.color} ${pos}}\n    ${txt(linesToText(it))}`;
    case 'text': return `- Text {id:${it.id} size:${it.size || 'M'} ${pos}}\n    ${txt(linesToText(it))}`;
    case 'shape': return `- Shape ${it.shape} {id:${it.id} color:${it.color} ${pos}}: ${plain(it)}`;
    case 'section': return `- Section "${it.name}" {id:${it.id} ${pos} w:${it.w} h:${it.h}}`;
    case 'sticker': return `- Sticker ${it.emoji} {id:${it.id} ${pos}}`;
    case 'image': return `- Image {id:${it.id} ${pos}}`;
    case 'video': return `- Video {id:${it.id} ${pos}} ${it.embed || it.url || it.name || '(uploaded file)'}`;
    case 'ink': return `- Drawing {id:${it.id} ${pos}}`;
    case 'chart': return `- Chart ${it.kind} "${it.title || ''}" {id:${it.id} table:${it.tableId}}`;
    case 'table': {
      const rows = (it.rows || []).map((r) => `| ${r.map((c) => htmlToText(c, true).replace(/\|/g, '\\|')).join(' | ')} |`);
      if (rows.length && it.header !== false) rows.splice(1, 0, `|${(it.rows[0] || []).map(() => ' --- ').join('|')}|`);
      return `- Table {id:${it.id} ${pos}}\n${rows.map((r) => `    ${r}`).join('\n')}`;
    }
    default: return `- ${it.type} {id:${it.id}}`;
  }
}

function endName(d, e) {
  if (!e || !e.ref) return `(point ${Math.round(e.x)},${Math.round(e.y)})`;
  if (e.ref.startsWith('node:')) { const n = d.nodes[e.ref.slice(5)]; return n ? `"${plain(n)}"` : '(missing)'; }
  const it = d.items[e.ref];
  return it ? `"${itemLabel(it) || it.type}"` : '(missing)';
}

// Todo el tablero en Markdown, con ids para poder referirse a cada cosa.
function describe(board) {
  const d = board.doc;
  const out = [`# ${board.title || plain(d.nodes[d.rootId]) || 'Untitled'}`, `board id: ${board.id} · updated ${new Date(board.updatedAt || Date.now()).toISOString()}`];
  const roots = rootIdsOf(d);
  out.push('', `## Mind maps (${roots.length})`);
  for (const r of roots) out.push('', outlineOf(d, r));
  const items = Object.values(d.items || {}).sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
  const things = items.filter((i) => i.type !== 'conn');
  if (things.length) { out.push('', `## Items (${things.length})`); for (const it of things) out.push(describeItem(d, it)); }
  const conns = items.filter((i) => i.type === 'conn');
  if (conns.length) {
    out.push('', `## Connectors (${conns.length})`);
    for (const c of conns) out.push(`- ${endName(d, c.from)} → ${endName(d, c.to)}${c.label ? ` "${c.label}"` : ''} {id:${c.id}}`);
  }
  return out.join('\n');
}

// Para leerlo como JSON: sin las imágenes incrustadas (pueden ocupar megas).
function slimDoc(d) {
  const copy = JSON.parse(JSON.stringify(d));
  for (const it of Object.values(copy.items || {})) if (it.type === 'image' && it.src) it.src = `(image ${Math.round(it.src.length / 1024)} KB)`;
  return copy;
}

function counts(d) {
  const items = Object.values(d.items || {});
  return { nodes: Object.keys(d.nodes || {}).length, mindmaps: rootIdsOf(d).length, items: items.filter((i) => i.type !== 'conn').length, connectors: items.filter((i) => i.type === 'conn').length };
}

module.exports = {
  uid, esc, textToLines, linesToText, htmlToText, plain, parseOutline, newDoc, makeNode, kidsOf, rootIdsOf, rootOf, nextColor,
  addTree, addMindmap, subtreeIds, deleteNodes, moveNode, buildItem, addItems, deleteItems, connect, findNode, findItem, findEnd,
  describe, outlineOf, slimDoc, counts, contentBounds, mapBounds, itemBounds, itemLabel, videoEmbed,
  NOTE_COLORS, TEXT_COLORS, SHAPE_COLORS, SECTION_COLORS, SHAPES, SHAPE_STYLES, CHARTS, TEXT_SIZES, BRANCH_COLORS,
};
