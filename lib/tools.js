// Las herramientas que un agente de IA puede usar sobre tus tableros (MCP y línea de comandos usan las mismas).
// Cada una: nombre, descripción, esquema de parámetros y la función que la hace. Devuelven texto pensado para leerlo.
// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const fs = require('fs');
const path = require('path');
const Store = require('./store');
const B = require('./board');

const FOLDER_COLORS = ['purple', 'blue', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'gray'];
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const titleOf = (b) => (b.title && b.title.trim()) || (b.doc && b.doc.nodes && b.doc.nodes[b.doc.rootId] ? B.plain(b.doc.nodes[b.doc.rootId]) : '') || 'Untitled';

// Estado del servidor local (lo escribe server.js al arrancar): puerto y tablero abierto en el navegador.
function serverInfo(store) {
  const f = path.join(store.dir, 'server.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
function sessionInfo(store) {
  try { return JSON.parse(fs.readFileSync(path.join(store.dir, 'session.json'), 'utf8')); } catch { return null; }
}
const appURL = (store, id) => {
  const port = (serverInfo(store) || {}).port || Number(process.env.PORT) || 4321;
  return `http://localhost:${port}/${id ? `#m=${encodeURIComponent(id)}` : ''}`;
};

// Tablero por id, por título o «open» (el que está abierto en la app).
function resolveBoard(store, ref) {
  const list = store.listBoards();
  if (!list.length) fail('There are no boards yet. Create one with create_board', 404);
  const r = ref == null ? '' : String(ref).trim();
  if (!r || /^(open|current|active)$/i.test(r)) {
    const s = sessionInfo(store);
    const open = s && list.find((b) => b.id === s.openBoard);
    if (open) return open.id;
    if (!r) return list[0].id;
    fail('No board is open in the app right now. Pass a board id or title (see list_boards)', 404);
  }
  if (list.some((b) => b.id === r)) return r;
  const byTitle = (pred) => list.filter((b) => pred(norm(b.title || '')));
  let hits = byTitle((t) => t === norm(r));
  if (!hits.length) {
    // Sin título propio: se busca por la idea central.
    hits = list.filter((b) => !b.title && norm(titleOf(store.getBoard(b.id) || {})) === norm(r));
  }
  if (!hits.length) hits = byTitle((t) => t.includes(norm(r)));
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) fail(`Several boards match "${ref}": ${hits.map((b) => `"${b.title}" (${b.id})`).join(', ')}. Use the id`);
  fail(`No board matches "${ref}". Call list_boards to see them`, 404);
}

function resolveFolder(store, ref, { create = false } = {}) {
  if (ref == null) return undefined;
  const r = String(ref).trim();
  if (!r || r === '/' || /^(none|root)$/i.test(r)) return null;
  const { folders } = store.readFolders();
  const byId = folders.find((f) => f.id === r);
  if (byId) return byId.id;
  // Ruta "Trabajo / Clientes" o un nombre.
  const parts = r.split('/').map((p) => p.trim()).filter(Boolean);
  let parent = null;
  for (const p of parts) {
    const hit = folders.filter((f) => (f.parentId || null) === parent && norm(f.name) === norm(p));
    if (hit.length) { parent = hit[0].id; continue; }
    if (parts.length === 1) {
      const any = folders.filter((f) => norm(f.name) === norm(p));
      if (any.length === 1) return any[0].id;
      if (any.length > 1) fail(`Several folders are called "${p}". Use a path like "Parent / ${p}" or the id`);
    }
    if (!create) fail(`No folder "${r}". Create it with create_folder, or pass create_folder: true`, 404);
    const f = { id: B.uid(), name: p, parentId: parent, collapsed: false };
    store.putFolder(f);
    folders.push(f);
    parent = f.id;
  }
  return parent;
}

function folderPath(folders, id) {
  const out = [];
  for (let f = folders.find((x) => x.id === id); f; f = folders.find((x) => x.id === f.parentId)) out.unshift(f.name);
  return out.join(' / ');
}

const textArg = (v) => (Array.isArray(v) ? v.join('\n') : v == null ? '' : String(v));
// Lista de ramas: un esquema con sangría o una lista de textos.
function treeArg(args) {
  if (Array.isArray(args.texts) && args.texts.length) return args.texts.map((t) => ({ text: String(t), children: [] }));
  const tree = B.parseOutline(textArg(args.outline));
  if (!tree.length) fail('Pass "outline" (an indented list, one idea per line) or "texts" (a list of strings)');
  return tree;
}

function done(store, board, lines) {
  return `${lines.filter(Boolean).join('\n')}\nBoard "${titleOf(board)}" saved (rev ${board.rev}). If Mapache is open in the browser it updates by itself: ${appURL(store, board.id)}`;
}

const S = {
  board: { type: 'string', description: 'Board id or title. Use "open" for the board the person has open in the app' },
  node: { type: 'string', description: 'Node id (from read_board), its exact text, or a path like "Central idea > Branch"' },
  item: { type: 'string', description: 'Item id (from read_board) or its text' },
  outline: { type: 'string', description: 'Indented outline, one idea per line; indent (2 spaces or a tab) to nest. Markdown inside a line: **bold**, *italic*, `code`, [link](https://…)' },
};

const ITEM_SPEC = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['note', 'text', 'shape', 'section', 'sticker', 'table', 'chart', 'video'] },
    text: { type: 'string', description: 'Text of a note, text or shape (newlines allowed; lines starting with "# ", "- ", "1. " or "[ ] " become headings, bullets, numbered items or checkboxes)' },
    color: { type: 'string', description: `note: ${B.NOTE_COLORS.join('|')} · text: ${B.TEXT_COLORS.join('|')} · shape: ${B.SHAPE_COLORS.join('|')} · section: ${B.SECTION_COLORS.join('|')}` },
    shape: { type: 'string', enum: Object.keys(B.SHAPES), description: 'For shapes (default rect)' },
    style: { type: 'string', enum: B.SHAPE_STYLES, description: 'For shapes (default border)' },
    size: { type: 'string', enum: B.TEXT_SIZES, description: 'For text (default M)' },
    name: { type: 'string', description: 'Section name' },
    rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number'] } }, description: 'Table cells, first row is the header' },
    table: { type: 'string', description: 'For a chart: id of the table with its data' },
    kind: { type: 'string', enum: B.CHARTS, description: 'Chart type (default column)' },
    title: { type: 'string', description: 'Chart title' },
    emoji: { type: 'string', description: 'For a sticker' },
    url: { type: 'string', description: 'For a video: YouTube, Vimeo, Loom or a direct .mp4 link' },
    x: { type: 'number', description: 'Usually leave x and y out: Mapache finds free space. Give them only to put the item at a precise spot (it still moves down if that spot is taken)' },
    y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
  },
  required: ['type'],
};

const tools = [
  {
    name: 'list_boards',
    title: 'List boards',
    description: 'List every Mapache board (mind maps and whiteboards) with its folder, id, size and last change. Start here.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { folder: { type: 'string', description: 'Only boards in this folder (name or id)' } } },
    run(store, args) {
      const { folders } = store.readFolders();
      let list = store.listBoards();
      if (args.folder) { const fid = resolveFolder(store, args.folder); list = list.filter((b) => (b.folderId || null) === fid); }
      const open = (sessionInfo(store) || {}).openBoard;
      if (!list.length) return 'No boards yet. Create one with create_board.';
      const rows = list.map((b) => {
        const full = store.getBoard(b.id);
        const c = B.counts(full.doc);
        const where = b.folderId ? folderPath(folders, b.folderId) : '';
        return `- "${titleOf(full)}" id:${b.id}${where ? ` folder:"${where}"` : ''} · ${c.nodes} nodes, ${c.items} items · updated ${new Date(b.updatedAt).toISOString().slice(0, 16).replace('T', ' ')}${b.id === open ? ' · OPEN IN THE APP' : ''}`;
      });
      const fl = folders.length ? `\nFolders: ${folders.map((f) => `"${folderPath(folders, f.id)}" (${f.id})`).join(', ')}` : '';
      return `${list.length} board(s):\n${rows.join('\n')}${fl}`;
    },
  },
  {
    name: 'read_board',
    title: 'Read a board',
    description: 'Read a whole board: its mind maps as indented outlines, notes, shapes, tables, charts and connectors, each with the id you need to change it.',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { board: S.board, format: { type: 'string', enum: ['markdown', 'json'], description: 'markdown (default, easy to read) or json (the raw document)' } } },
    run(store, args) {
      const b = store.getBoard(resolveBoard(store, args.board));
      if (args.format === 'json') return JSON.stringify({ ...b, doc: B.slimDoc(b.doc) }, null, 1);
      return B.describe({ ...b, title: titleOf(b) });
    },
  },
  {
    name: 'search_boards',
    title: 'Search boards',
    description: 'Search text across all boards (titles, mind map nodes, notes, shapes, tables, sections).',
    annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run(store, args) {
      const q = norm(args.query);
      if (!q) fail('Empty query');
      const out = [];
      for (const meta of store.listBoards()) {
        const b = store.getBoard(meta.id);
        const hits = [];
        if (norm(titleOf(b)).includes(q)) hits.push('  (title)');
        for (const n of Object.values(b.doc.nodes)) if (norm(B.plain(n)).includes(q)) hits.push(`  - node "${B.plain(n)}" id:${n.id}`);
        for (const it of Object.values(b.doc.items || {})) {
          if (it.type === 'conn') { if (norm(it.label).includes(q)) hits.push(`  - connector label "${it.label}" id:${it.id}`); continue; }
          const label = B.itemLabel(it);
          if (label && norm(label).includes(q)) hits.push(`  - ${it.type} "${label.slice(0, 120)}" id:${it.id}`);
        }
        if (hits.length) out.push(`"${titleOf(b)}" id:${b.id}\n${hits.slice(0, 30).join('\n')}`);
      }
      return out.length ? out.join('\n') : `Nothing found for "${args.query}".`;
    },
  },
  {
    name: 'create_board',
    title: 'Create a board',
    description: 'Create a new board with a mind map. Give an outline to fill it: if the outline has one top line it becomes the central idea; otherwise the title is the central idea and each top line a branch.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, outline: S.outline, folder: { type: 'string', description: 'Folder name, path ("Work / Clients") or id. Created if missing' }, layout: { type: 'string', enum: ['horizontal', 'vertical'] } }, required: ['title'] },
    run(store, args) {
      const tree = args.outline ? B.parseOutline(args.outline) : [];
      const single = tree.length === 1;
      const doc = B.newDoc(single ? tree[0].text : String(args.title));
      if (args.layout) doc.settings.layout = args.layout === 'vertical' ? 'vertical' : 'horizontal';
      const kids = single ? tree[0].children : tree;
      if (kids.length) B.addTree(doc, doc.rootId, kids);
      const now = Date.now();
      const board = store.putBoard({ id: B.uid(), title: String(args.title || ''), folderId: resolveFolder(store, args.folder, { create: true }) ?? null, doc, createdAt: now, updatedAt: now });
      return done(store, board, [`Created board "${board.title}" id:${board.id} with ${Object.keys(doc.nodes).length} node(s). Central idea id:${doc.rootId}`]);
    },
  },
  {
    name: 'update_board',
    title: 'Rename or move a board',
    description: 'Rename a board, move it to a folder, or change its sidebar color or icon.',
    inputSchema: { type: 'object', properties: { board: S.board, title: { type: 'string' }, folder: { type: 'string', description: 'Folder name, path or id; "" or "root" for no folder. Created if missing' },
      color: { type: 'string', enum: [...FOLDER_COLORS, 'none'] }, icon: { type: 'string', description: 'An emoji, or "none"' } }, required: ['board'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const folderId = resolveFolder(store, args.folder, { create: true });
      const { board } = store.updateBoard(id, (b) => {
        if (args.title != null) b.title = String(args.title);
        if (folderId !== undefined) b.folderId = folderId;
        if (args.color) { if (args.color === 'none') delete b.color; else b.color = args.color; }
        if (args.icon) { if (args.icon === 'none') delete b.icon; else b.icon = String(args.icon).slice(0, 8); }
      });
      return done(store, board, ['Board updated.']);
    },
  },
  {
    name: 'delete_board',
    title: 'Delete a board',
    description: 'Move a board to the trash (it can be restored with `mapache restore <id>`). Only do this when the person asks.',
    annotations: { destructiveHint: true },
    inputSchema: { type: 'object', properties: { board: S.board }, required: ['board'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const b = store.getBoard(id);
      store.removeBoard(id);
      return `Moved "${titleOf(b)}" (${id}) to the trash. Restore it with: mapache restore ${id}`;
    },
  },
  {
    name: 'create_folder',
    title: 'Create a folder',
    description: 'Create a folder in the sidebar (optionally inside another one).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, parent: { type: 'string', description: 'Parent folder name, path or id' }, color: { type: 'string', enum: FOLDER_COLORS }, icon: { type: 'string', description: 'An emoji' } }, required: ['name'] },
    run(store, args) {
      const parentId = resolveFolder(store, args.parent) ?? null;
      const f = { id: B.uid(), name: String(args.name), parentId, collapsed: false };
      if (args.color) f.color = args.color;
      if (args.icon) f.icon = String(args.icon).slice(0, 8);
      store.putFolder(f);
      return `Created folder "${f.name}" id:${f.id}`;
    },
  },
  {
    name: 'add_nodes',
    title: 'Add mind map branches',
    description: 'Add child nodes under a node of a mind map, from an indented outline (nested branches) or a list of texts.',
    inputSchema: { type: 'object', properties: { board: S.board, parent: S.node, outline: S.outline, texts: { type: 'array', items: { type: 'string' }, description: 'Alternative to outline: one child per text' },
      position: { type: 'integer', description: 'Insert at this index among the existing children (default: at the end)' } }, required: ['board', 'parent'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const tree = treeArg(args);
      const { board, result } = store.updateBoard(id, (b) => {
        const pid = B.findNode(b.doc, args.parent);
        return { pid, ids: B.addTree(b.doc, pid, tree, { position: args.position }) };
      });
      const d = board.doc;
      return done(store, board, [`Added ${result.ids.length} node(s) under "${B.plain(d.nodes[result.pid])}":`, ...result.ids.map((n) => `- "${B.plain(d.nodes[n])}" id:${n}`)]);
    },
  },
  {
    name: 'update_nodes',
    title: 'Edit mind map nodes',
    description: 'Change the text, branch color, icon, folded state or checkbox of one or more nodes.',
    inputSchema: { type: 'object', properties: { board: S.board, updates: { type: 'array', items: { type: 'object', properties: {
      node: S.node, text: { type: 'string' }, color: { type: 'string', enum: B.BRANCH_COLORS, description: 'Branch color (for first-level branches it colors the whole branch)' },
      icon: { type: 'string', description: 'An emoji before the text, or "none"' }, collapsed: { type: 'boolean' }, checked: { type: 'boolean', description: 'Turns the node into a checkbox, ticked or not' } }, required: ['node'] } } }, required: ['board', 'updates'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      if (!Array.isArray(args.updates) || !args.updates.length) fail('Pass "updates": a list of { node, text?, color?, icon?, collapsed?, checked? }');
      const { board, result } = store.updateBoard(id, (b) => args.updates.map((u) => {
        const nid = B.findNode(b.doc, u.node);
        const n = b.doc.nodes[nid];
        if (u.text != null) { delete n.blocks; Object.assign(n, B.textToLines(u.text)); }
        if (u.color) n.style.color = u.color;
        if (u.icon) n.icon = u.icon === 'none' ? null : String(u.icon).slice(0, 8);
        if (u.collapsed != null) { if (u.collapsed) n.style.collapsed = true; else delete n.style.collapsed; }
        if (u.checked != null) { n.block = 'check'; delete n.blocks; n.checked = n.lines.map(() => !!u.checked); }
        return nid;
      }));
      return done(store, board, [`Updated ${result.length} node(s).`]);
    },
  },
  {
    name: 'move_node',
    title: 'Move a branch',
    description: 'Move a node (with its whole branch) under another parent, or reorder it among its siblings.',
    inputSchema: { type: 'object', properties: { board: S.board, node: S.node, parent: { ...S.node, description: 'New parent node' }, position: { type: 'integer', description: 'Index among the new siblings (default: last)' } }, required: ['board', 'node', 'parent'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const { board } = store.updateBoard(id, (b) => B.moveNode(b.doc, B.findNode(b.doc, args.node), B.findNode(b.doc, args.parent), args.position));
      return done(store, board, ['Branch moved.']);
    },
  },
  {
    name: 'delete_nodes',
    title: 'Delete mind map nodes',
    description: 'Delete nodes and everything under them. Only when the person asks.',
    annotations: { destructiveHint: true },
    inputSchema: { type: 'object', properties: { board: S.board, nodes: { type: 'array', items: { type: 'string' }, description: 'Node ids or texts' } }, required: ['board', 'nodes'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const { board, result } = store.updateBoard(id, (b) => B.deleteNodes(b.doc, (args.nodes || []).map((n) => B.findNode(b.doc, n))));
      return done(store, board, [`Deleted ${result.length} node(s).`]);
    },
  },
  {
    name: 'add_mindmap',
    title: 'Add a mind map',
    description: 'Add another mind map to an existing board (a board can hold several). The first line of the outline is its central idea. It is placed in free space unless you give x and y.',
    inputSchema: { type: 'object', properties: { board: S.board, outline: S.outline, layout: { type: 'string', enum: ['horizontal', 'vertical'] }, lines: { type: 'string', enum: ['curvy', 'angular'] }, x: { type: 'number' }, y: { type: 'number' } }, required: ['board', 'outline'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const { board, result } = store.updateBoard(id, (b) => B.addMindmap(b.doc, args.outline, args));
      return done(store, board, [`Added a mind map "${B.plain(board.doc.nodes[result[0]])}" (central idea id:${result[0]}) with ${result.length} node(s).`]);
    },
  },
  {
    name: 'add_items',
    title: 'Add notes, shapes, tables…',
    description: 'Add sticky notes, text, shapes, sections, stickers, tables, charts or video embeds to a board. They are laid out together in free space unless each has x and y. To chart data, add a table first, then a chart with its id.',
    inputSchema: { type: 'object', properties: { board: S.board, items: { type: 'array', items: ITEM_SPEC }, x: { type: 'number', description: 'Top-left of the group. Usually leave it out: Mapache places the group in free space' }, y: { type: 'number' } }, required: ['board', 'items'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      if (!Array.isArray(args.items) || !args.items.length) fail('Pass "items": a list like [{ "type": "note", "text": "…" }]');
      const { board, result } = store.updateBoard(id, (b) => B.addItems(b.doc, args.items, args));
      return done(store, board, [`Added ${result.length} item(s):`, ...result.map((i) => `- ${board.doc.items[i].type} id:${i}`)]);
    },
  },
  {
    name: 'update_items',
    title: 'Edit notes, shapes, tables…',
    description: 'Change the text, color, position, size or other properties of items (notes, text, shapes, sections, tables, charts, connectors).',
    inputSchema: { type: 'object', properties: { board: S.board, updates: { type: 'array', items: { type: 'object', properties: {
      item: S.item, text: { type: 'string' }, color: { type: 'string' }, name: { type: 'string', description: 'Section name' }, label: { type: 'string', description: 'Connector label' },
      shape: { type: 'string', enum: Object.keys(B.SHAPES) }, style: { type: 'string' }, size: { type: 'string', enum: B.TEXT_SIZES },
      rows: ITEM_SPEC.properties.rows, kind: ITEM_SPEC.properties.kind, title: { type: 'string' },
      x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' }, locked: { type: 'boolean' } }, required: ['item'] } } }, required: ['board', 'updates'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      if (!Array.isArray(args.updates) || !args.updates.length) fail('Pass "updates": a list of { item, … }');
      const { board, result } = store.updateBoard(id, (b) => args.updates.map((u) => {
        const iid = b.doc.items[u.item] ? u.item : B.findItem(b.doc, u.item);
        const it = b.doc.items[iid];
        if (u.text != null && ['note', 'text', 'shape'].includes(it.type)) { delete it.blocks; Object.assign(it, B.textToLines(u.text, { blocks: it.type !== 'shape' })); }
        if (u.name != null && it.type === 'section') it.name = String(u.name);
        if (u.label != null && it.type === 'conn') it.label = String(u.label);
        if (u.title != null && it.type === 'chart') it.title = String(u.title);
        if (u.kind && it.type === 'chart') it.kind = B.CHARTS.includes(u.kind) ? u.kind : fail(`Unknown chart kind ${u.kind}`);
        if (u.rows && it.type === 'table') { const t = B.buildItem(b.doc, { type: 'table', rows: u.rows }); it.rows = t.rows; it.cols = t.cols; }
        if (u.shape && it.type === 'shape') it.shape = u.shape;
        if (u.size && it.type === 'text') it.size = u.size;
        if (u.color) {
          const allowed = { note: B.NOTE_COLORS, text: B.TEXT_COLORS, shape: B.SHAPE_COLORS, section: B.SECTION_COLORS, table: B.SHAPE_COLORS }[it.type];
          if (allowed && !allowed.includes(u.color)) fail(`Color "${u.color}" is not available for a ${it.type}. Use: ${allowed.join(', ')}`);
          it.color = u.color;
        }
        if (u.style) it.style = u.style;
        for (const k of ['x', 'y', 'w', 'h']) if (Number.isFinite(u[k])) it[k] = Math.round(u[k]);
        if (u.locked != null) { if (u.locked) it.locked = true; else delete it.locked; }
        return iid;
      }));
      return done(store, board, [`Updated ${result.length} item(s).`]);
    },
  },
  {
    name: 'delete_items',
    title: 'Delete items',
    description: 'Delete notes, shapes, tables, charts, connectors or other items. Only when the person asks.',
    annotations: { destructiveHint: true },
    inputSchema: { type: 'object', properties: { board: S.board, items: { type: 'array', items: { type: 'string' }, description: 'Item ids or texts' } }, required: ['board', 'items'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const { board, result } = store.updateBoard(id, (b) => B.deleteItems(b.doc, (args.items || []).map((i) => (b.doc.items[i] ? i : B.findItem(b.doc, i)))));
      return done(store, board, [`Deleted ${result.length} item(s).`]);
    },
  },
  {
    name: 'connect',
    title: 'Connect things',
    description: 'Draw connectors (arrows) between nodes and/or items, optionally with a label. Ends are referenced by id or by text.',
    inputSchema: { type: 'object', properties: { board: S.board, connections: { type: 'array', items: { type: 'object', properties: {
      from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' }, style: { type: 'string', enum: ['solid', 'dashed'] }, route: { type: 'string', enum: ['elbow', 'curved', 'straight'] },
      endCap: { type: 'string', enum: ['arrow', 'none', 'triangle', 'triangle-open', 'circle', 'circle-open', 'diamond', 'diamond-open', 'bar'], description: 'Arrowhead at the "to" end (default arrow)' } }, required: ['from', 'to'] } } }, required: ['board', 'connections'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      if (!Array.isArray(args.connections) || !args.connections.length) fail('Pass "connections": a list of { from, to, label? }');
      const { board, result } = store.updateBoard(id, (b) => args.connections.map((c) => B.connect(b.doc, c.from, c.to, c)));
      return done(store, board, [`Added ${result.length} connector(s).`]);
    },
  },
  {
    name: 'open_board',
    title: 'Open a board in the app',
    description: 'Open a board in Mapache in the person\'s browser (starting Mapache if needed), so they can see it. Returns its address.',
    inputSchema: { type: 'object', properties: { board: S.board, launch: { type: 'boolean', description: 'Open the browser (default true). false only returns the address' } } },
    async run(store, args, ctx = {}) {
      const id = resolveBoard(store, args.board);
      const url = ctx.open ? await ctx.open(id, args.launch !== false) : appURL(store, id);
      return `${args.launch === false ? 'Address' : 'Opened'}: ${url}`;
    },
  },
];

async function call(name, args = {}, ctx = {}) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) fail(`Unknown tool "${name}". Available: ${tools.map((t) => t.name).join(', ')}`, 404);
  const store = ctx.store || Store.open();
  return tool.run(store, args || {}, ctx);
}

module.exports = { tools, call, resolveBoard, resolveFolder, titleOf, appURL, serverInfo };
