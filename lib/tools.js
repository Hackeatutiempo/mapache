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
// En modo equipo cada persona tiene su tablero abierto; `current` es quien usa la herramienta (si se sabe).
let current = null;
function sessionInfo(store) {
  let s = null;
  try { s = JSON.parse(fs.readFileSync(path.join(store.dir, 'session.json'), 'utf8')); } catch { return null; }
  if (current && s.byUser && s.byUser[current.id]) return s.byUser[current.id];
  return s;
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

// Quién firma lo que escribe un agente: el nombre de su cliente MCP (o «Command line» desde la terminal).
const CLIENT_NAMES = { 'claude-code': 'Claude Code', 'claude-ai': 'Claude', 'codex-mcp-client': 'Codex', 'cursor-vscode': 'Cursor' };
// En modo equipo, además, de quién es el agente: «Claude Code (Ana)».
function agentAuthor(ctx = {}) {
  const n = ctx.client && ctx.client.name ? String(ctx.client.name).trim() : '';
  const name = CLIENT_NAMES[n] || n || 'AI agent';
  if (ctx.user && ctx.user.id) return { id: `agent:${ctx.user.id}`, name: `${name} (${ctx.user.name})`.slice(0, 80) };
  return { id: 'agent', name: name.slice(0, 60) };
}
// Personas del servidor de equipo (users.json, si existe) para resolver las @menciones.
function teamMembers(store) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(store.dir, 'users.json'), 'utf8'));
    return (Array.isArray(j && j.users) ? j.users : []).filter((u) => u && u.id && u.name).map((u) => ({ id: String(u.id), name: String(u.name) }));
  } catch { return []; }
}
const mentionNames = (members, ids) => ids.map((id) => (members.find((m) => m.id === id) || {}).name).filter(Boolean);

function done(store, board, lines) {
  return `${lines.filter(Boolean).join('\n')}\nBoard "${titleOf(board)}" saved (rev ${board.rev}). If Mapache is open in the browser it updates by itself: ${appURL(store, board.id)}`;
}

const S = {
  board: { type: 'string', description: 'Board id or title. Use "open" for the board the person has open in the app' },
  node: { type: 'string', description: 'Node id (from read_board), its exact text, or a path like "Central idea > Branch"' },
  item: { type: 'string', description: 'Item id (from read_board) or its text' },
  outline: { type: 'string', description: 'Indented outline, one idea per line; indent (2 spaces or a tab) to nest. Markdown inside a line: **bold**, *italic*, `code`, [link](https://…)' },
};

// Lo que hace cada herramienta al mundo, para que el agente lo sepa sin probarla (anotaciones MCP).
const ANN = {
  read: { readOnlyHint: true, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  set: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  remove: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};
// Frase común de las herramientas que cambian un tablero.
const LIVE = 'It is saved at once as a new revision of the board and appears live in any browser that has it open (the person can undo it with Ctrl+Z).';

const ITEM_SPEC = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['note', 'text', 'shape', 'section', 'sticker', 'table', 'chart', 'video'], description: 'What to add: a sticky note, free text, a shape (for flowcharts), a named section that groups things, an emoji sticker, a table, a chart of a table, or a video embed' },
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
    y: { type: 'number', description: 'Top of the item, in board units (see x)' },
    w: { type: 'number', description: 'Width in board units (default depends on the type; notes and shapes also grow with their text)' },
    h: { type: 'number', description: 'Height in board units (default depends on the type)' },
  },
  required: ['type'],
};

const tools = [
  {
    name: 'list_boards',
    title: 'List boards',
    description: 'List every Mapache board (mind maps and whiteboards). Start here: it returns one line per board with its title, id, folder, number of nodes, items and open comments, last change, and which board is open in the app, plus the list of folders. Read-only. Use read_board next to see a board\'s content, or search_boards to find text across boards.',
    annotations: ANN.read,
    inputSchema: { type: 'object', properties: { folder: { type: 'string', description: 'Only list the boards in this folder (its name, path like "Work / Clients", or id). Leave out to list all boards' } } },
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
        return `- "${titleOf(full)}" id:${b.id}${where ? ` folder:"${where}"` : ''} · ${c.nodes} nodes, ${c.items} items${c.comments ? `, ${c.comments} open comment(s)` : ''} · updated ${new Date(b.updatedAt).toISOString().slice(0, 16).replace('T', ' ')}${b.id === open ? ' · OPEN IN THE APP' : ''}`;
      });
      const fl = folders.length ? `\nFolders: ${folders.map((f) => `"${folderPath(folders, f.id)}" (${f.id})`).join(', ')}` : '';
      return `${list.length} board(s):\n${rows.join('\n')}${fl}`;
    },
  },
  {
    name: 'read_board',
    title: 'Read a board',
    description: 'Read a whole board. Returns its mind maps as indented outlines, then its notes, shapes, tables, charts, connectors and open comments, each with the id the editing tools need. Read-only. Call it before changing a board you have not read in this conversation; use list_comments for the full comment threads.',
    annotations: ANN.read,
    inputSchema: { type: 'object', properties: { board: S.board, format: { type: 'string', enum: ['markdown', 'json'], description: 'markdown (default): an easy-to-read outline with ids. json: the raw board document, only when you need exact positions or styles' } } },
    run(store, args) {
      const b = store.getBoard(resolveBoard(store, args.board));
      if (args.format === 'json') return JSON.stringify({ ...b, doc: B.slimDoc(b.doc) }, null, 1);
      return B.describe({ ...b, title: titleOf(b) });
    },
  },
  {
    name: 'search_boards',
    title: 'Search boards',
    description: 'Search text across all boards: titles, mind map nodes, notes, shapes, tables, sections, connector labels and comments. Case and accents are ignored. Returns, for each board with matches, its title and id and up to 30 hits with their ids. Read-only. Use it to find which board talks about something; use read_board to see one board in full.',
    annotations: ANN.read,
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for (matched as a substring, ignoring case and accents)' } }, required: ['query'] },
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
        for (const c of Object.values(b.doc.comments || {})) {
          const texts = [c.text, ...Object.values(c.replies || {}).map((r) => r && r.text)];
          if (texts.some((x) => norm(x).includes(q))) hits.push(`  - comment by ${(c.author && c.author.name) || '?'} "${String(c.text || '').slice(0, 120)}" id:${c.id}${c.resolved ? ' (resolved)' : ''}`);
        }
        if (hits.length) out.push(`"${titleOf(b)}" id:${b.id}\n${hits.slice(0, 30).join('\n')}`);
      }
      return out.length ? out.join('\n') : `Nothing found for "${args.query}".`;
    },
  },
  {
    name: 'create_board',
    title: 'Create a board',
    description: 'Create a new board with a mind map. Give an outline to fill it: if the outline has one top line it becomes the central idea; otherwise the title is the central idea and each top line a branch. Always creates a new board (calling it twice makes two). Returns the board id, the central idea id and the address to open it. To add to an existing board use add_nodes, add_mindmap or add_items instead.',
    annotations: ANN.write,
    inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Board title, shown in the sidebar (and as the central idea when the outline has several top lines)' }, outline: S.outline,
      folder: { type: 'string', description: 'Folder name, path ("Work / Clients") or id to put the board in. Missing folders are created. Leave out for no folder' },
      layout: { type: 'string', enum: ['horizontal', 'vertical'], description: 'horizontal (default): branches to the left and right. vertical: an org-chart that grows downwards' } }, required: ['title'] },
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
    description: 'Rename a board, move it to a folder, or change its color or icon in the sidebar. Only the fields you pass change; the content of the board is untouched (to edit content use update_nodes or update_items). Returns a confirmation and the board address.',
    annotations: ANN.set,
    inputSchema: { type: 'object', properties: { board: S.board, title: { type: 'string', description: 'New title' },
      folder: { type: 'string', description: 'Folder to move it to: name, path ("Work / Clients") or id; "" or "root" for no folder. Missing folders are created' },
      color: { type: 'string', enum: [...FOLDER_COLORS, 'none'], description: 'Color of the board in the sidebar, or "none" to remove it' },
      icon: { type: 'string', description: 'An emoji shown before the title in the sidebar, or "none" to remove it' } }, required: ['board'] },
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
    description: 'Move a whole board to the trash. It disappears from the app; it can be restored with `mapache restore <id>`, which the result tells you. Only do this when the person asks. To remove part of a board use delete_nodes or delete_items instead.',
    annotations: ANN.remove,
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
    description: 'Create a folder in the sidebar to organize boards, optionally inside another folder. Always creates a new folder, even if one with the same name exists; returns its id. You rarely need it: create_board and update_board create missing folders by themselves when you pass a folder path.',
    annotations: ANN.write,
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Folder name as shown in the sidebar' },
      parent: { type: 'string', description: 'Parent folder name, path ("Work / Clients") or id; it must already exist (you get an error otherwise). Leave out for a top-level folder' },
      color: { type: 'string', enum: FOLDER_COLORS, description: 'Color of the folder in the sidebar (default none)' },
      icon: { type: 'string', description: 'An emoji shown before the name' } }, required: ['name'] },
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
    description: `Add child nodes under an existing node of a mind map, from an indented outline (nested branches) or a flat list of texts. ${LIVE} Returns each new node with its id. Use it to grow a map; use add_mindmap for a separate new map and create_board for a new board.`,
    annotations: ANN.write,
    inputSchema: { type: 'object', properties: { board: S.board, parent: { ...S.node, description: `${S.node.description}. The new nodes become its children` }, outline: S.outline, texts: { type: 'array', items: { type: 'string' }, description: 'Alternative to outline: one child per text, all at the same level' },
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
    description: `Change existing mind map nodes: text, branch color, icon, folded state or checkbox. Several nodes in one call; in each update only the fields you pass change. ${LIVE} Returns how many nodes changed. To add nodes use add_nodes, to move them move_node, to remove them delete_nodes.`,
    annotations: ANN.set,
    inputSchema: { type: 'object', properties: { board: S.board, updates: { type: 'array', description: 'One entry per node to change', items: { type: 'object', properties: {
      node: S.node, text: { type: 'string', description: 'New text (replaces the old one; Markdown like **bold** allowed, newlines for several lines)' },
      color: { type: 'string', enum: B.BRANCH_COLORS, description: 'Branch color (for first-level branches it colors the whole branch)' },
      icon: { type: 'string', description: 'An emoji before the text, or "none" to remove it' },
      collapsed: { type: 'boolean', description: 'true folds the branch (hides its children), false unfolds it' },
      checked: { type: 'boolean', description: 'Turns the node into a checkbox, ticked (true) or not (false)' } }, required: ['node'] } } }, required: ['board', 'updates'] },
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
    description: `Move a node, with its whole branch, under another parent (in the same board), or reorder it among its siblings by giving its current parent and a new position. A node cannot go under itself or its own children. ${LIVE} Returns a confirmation.`,
    annotations: ANN.set,
    inputSchema: { type: 'object', properties: { board: S.board, node: { ...S.node, description: `The node to move. ${S.node.description}` }, parent: { ...S.node, description: 'New parent node (id, text or path). Pass its current parent to only reorder it' },
      position: { type: 'integer', description: 'Index among the new siblings, 0 = first (default: last)' } }, required: ['board', 'node', 'parent'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const { board } = store.updateBoard(id, (b) => B.moveNode(b.doc, B.findNode(b.doc, args.node), B.findNode(b.doc, args.parent), args.position));
      return done(store, board, ['Branch moved.']);
    },
  },
  {
    name: 'delete_nodes',
    title: 'Delete mind map nodes',
    description: 'Delete mind map nodes and every node under them, plus the connectors attached to them (comments pinned to them stay, unpinned). The central idea of the main map cannot be deleted. Only when the person asks; they can undo it in the app with Ctrl+Z. Returns how many nodes were removed. To change a node instead use update_nodes.',
    annotations: ANN.remove,
    inputSchema: { type: 'object', properties: { board: S.board, nodes: { type: 'array', items: { type: 'string' }, description: 'Nodes to delete: ids (from read_board), exact texts or paths like "Central idea > Branch"' } }, required: ['board', 'nodes'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const { board, result } = store.updateBoard(id, (b) => B.deleteNodes(b.doc, (args.nodes || []).map((n) => B.findNode(b.doc, n))));
      return done(store, board, [`Deleted ${result.length} node(s).`]);
    },
  },
  {
    name: 'add_mindmap',
    title: 'Add a mind map',
    description: `Add another, separate mind map to an existing board (a board can hold several). The first line of the outline is its central idea and the indented lines its branches. It is placed in free space unless you give x and y. ${LIVE} Returns the id of its central idea. To grow a map that already exists use add_nodes.`,
    annotations: ANN.write,
    inputSchema: { type: 'object', properties: { board: S.board, outline: S.outline,
      layout: { type: 'string', enum: ['horizontal', 'vertical'], description: 'horizontal (default): branches to the left and right. vertical: grows downwards like an org chart' },
      lines: { type: 'string', enum: ['curvy', 'angular'], description: 'Shape of the branch lines (default curvy)' },
      x: { type: 'number', description: 'Position of the central idea in board units. Usually leave x and y out' }, y: { type: 'number', description: 'See x' } }, required: ['board', 'outline'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const { board, result } = store.updateBoard(id, (b) => B.addMindmap(b.doc, args.outline, args));
      return done(store, board, [`Added a mind map "${B.plain(board.doc.nodes[result[0]])}" (central idea id:${result[0]}) with ${result.length} node(s).`]);
    },
  },
  {
    name: 'add_items',
    title: 'Add notes, shapes, tables…',
    description: `Add sticky notes, text, shapes, sections, stickers, tables, charts or video embeds to a board. They are laid out together in free space unless each has x and y. To chart data, add a table first, then a chart with its id. ${LIVE} Returns each new item with its type and id (use the ids with connect, update_items or a chart's table). For mind map branches use add_nodes instead.`,
    annotations: ANN.write,
    inputSchema: { type: 'object', properties: { board: S.board, items: { type: 'array', items: ITEM_SPEC, description: 'The items to add, placed as a group' },
      x: { type: 'number', description: 'Top-left of the group. Usually leave it out: Mapache places the group in free space' }, y: { type: 'number', description: 'See x' } }, required: ['board', 'items'] },
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
    description: `Change existing items (notes, text, shapes, sections, tables, charts, connectors): text, color, position, size, table cells, chart type and more. Several items in one call; in each update only the fields you pass change, and fields that do not apply to that item type are ignored. A wrong color for the type returns an error listing the valid ones. ${LIVE} Returns how many items changed. For mind map nodes use update_nodes.`,
    annotations: ANN.set,
    inputSchema: { type: 'object', properties: { board: S.board, updates: { type: 'array', description: 'One entry per item to change', items: { type: 'object', properties: {
      item: S.item, text: { type: 'string', description: 'New text of a note, text or shape (replaces the old one)' },
      color: { type: 'string', description: ITEM_SPEC.properties.color.description },
      name: { type: 'string', description: 'Section name' }, label: { type: 'string', description: 'Connector label ("" removes it)' },
      shape: { type: 'string', enum: Object.keys(B.SHAPES), description: 'Change the outline of a shape' },
      style: { type: 'string', description: `Shape: ${B.SHAPE_STYLES.join('|')}. Connector: solid|dashed` },
      size: { type: 'string', enum: B.TEXT_SIZES, description: 'Text size of a text item' },
      rows: { ...ITEM_SPEC.properties.rows, description: 'Replace all the cells of a table (first row is the header); charts made from it update' },
      kind: ITEM_SPEC.properties.kind, title: { type: 'string', description: 'Chart title' },
      x: { type: 'number', description: 'New left position in board units' }, y: { type: 'number', description: 'New top position in board units' },
      w: { type: 'number', description: 'New width' }, h: { type: 'number', description: 'New height' },
      locked: { type: 'boolean', description: 'true locks the item so the person cannot move it by accident' } }, required: ['item'] } } }, required: ['board', 'updates'] },
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
    description: 'Delete notes, shapes, tables, charts, connectors or other items, plus the connectors attached to them (comments pinned to them stay, unpinned). Only when the person asks; they can undo it in the app with Ctrl+Z. Returns how many items were removed. For mind map nodes use delete_nodes.',
    annotations: ANN.remove,
    inputSchema: { type: 'object', properties: { board: S.board, items: { type: 'array', items: { type: 'string' }, description: 'Items to delete: ids (from read_board) or their exact texts' } }, required: ['board', 'items'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      const { board, result } = store.updateBoard(id, (b) => B.deleteItems(b.doc, (args.items || []).map((i) => (b.doc.items[i] ? i : B.findItem(b.doc, i)))));
      return done(store, board, [`Deleted ${result.length} item(s).`]);
    },
  },
  {
    name: 'connect',
    title: 'Connect things',
    description: `Draw connectors (arrows) between nodes and/or items, optionally with a label, for flowcharts and relations. Several in one call; each call adds new connectors (it does not replace existing ones). The path routes itself around other objects. ${LIVE} Returns how many connectors were added. To change a connector later use update_items with its id.`,
    annotations: ANN.write,
    inputSchema: { type: 'object', properties: { board: S.board, connections: { type: 'array', description: 'One entry per arrow', items: { type: 'object', properties: {
      from: { type: 'string', description: 'Start: a node or item id (from read_board or add_items), or its exact text' },
      to: { type: 'string', description: 'End, where the arrowhead goes: a node or item id, or its exact text' },
      label: { type: 'string', description: 'Text on the line, like "Yes" or "No"' },
      style: { type: 'string', enum: ['solid', 'dashed'], description: 'Line style (default solid)' },
      route: { type: 'string', enum: ['elbow', 'curved', 'straight'], description: 'elbow (default): right angles, best for flowcharts. curved or straight for relations' },
      endCap: { type: 'string', enum: ['arrow', 'none', 'triangle', 'triangle-open', 'circle', 'circle-open', 'diamond', 'diamond-open', 'bar'], description: 'Arrowhead at the "to" end (default arrow)' } }, required: ['from', 'to'] } } }, required: ['board', 'connections'] },
    run(store, args) {
      const id = resolveBoard(store, args.board);
      if (!Array.isArray(args.connections) || !args.connections.length) fail('Pass "connections": a list of { from, to, label? }');
      const { board, result } = store.updateBoard(id, (b) => args.connections.map((c) => B.connect(b.doc, c.from, c.to, c)));
      return done(store, board, [`Added ${result.length} connector(s).`]);
    },
  },
  {
    name: 'list_comments',
    title: 'List comments',
    description: 'List the comment threads on a board. Returns, for each thread, its id, author, date, what it is pinned to, its text and its replies, oldest first. Read-only. Use it when the person asks you to review a board or answer comments; then reply_comment and resolve_comment.',
    annotations: ANN.read,
    inputSchema: { type: 'object', properties: { board: S.board, include_resolved: { type: 'boolean', description: 'Also list resolved comments (default false: only open ones)' } }, required: ['board'] },
    run(store, args) {
      const b = store.getBoard(resolveBoard(store, args.board));
      const all = Object.values(b.doc.comments || {}).filter((c) => c && c.id);
      const open = all.filter((c) => !c.resolved).length, resolved = all.length - open;
      if (!all.length) return `No comments on "${titleOf(b)}" yet.`;
      const text = B.describeComments(b.doc, { includeResolved: !!args.include_resolved });
      const head = `${open} open comment(s) on "${titleOf(b)}"${resolved ? `, ${resolved} resolved${args.include_resolved ? '' : ' (pass include_resolved to see them)'}` : ''}:`;
      return text ? `${head}\n${text}` : head;
    },
  },
  {
    name: 'add_comment',
    title: 'Comment on a board',
    description: 'Leave a comment on a board, pinned to a node or item ("on", by id or text) or at a point. Write @Name to mention someone from the team. Comments are for talking about the board, not content: they never appear in exports. The comment is signed with your agent name and shows up live for everyone. Returns the comment id and who was mentioned. Use it to ask or suggest instead of changing the person\'s work; to answer an existing thread use reply_comment.',
    annotations: ANN.write,
    inputSchema: { type: 'object', properties: { board: S.board, text: { type: 'string', description: 'The comment (plain text, newlines allowed)' },
      on: { type: 'string', description: 'Node or item id (from read_board) or its text. The pin goes on its top-right corner and follows it' },
      x: { type: 'number', description: 'Or a point on the board (leave out x, y and on to use free space)' }, y: { type: 'number', description: 'See x' } }, required: ['board', 'text'] },
    run(store, args, ctx = {}) {
      const id = resolveBoard(store, args.board);
      const members = teamMembers(store);
      const { board, result } = store.updateBoard(id, (b) => B.addComment(b.doc, { text: args.text, on: args.on, x: args.x, y: args.y, author: agentAuthor(ctx), members }));
      const c = board.doc.comments[result];
      const who = mentionNames(members, c.mentions);
      const label = !c.ref ? '' : c.ref.startsWith('node:') ? B.plain(board.doc.nodes[c.ref.slice(5)]) : B.itemLabel(board.doc.items[c.ref]) || board.doc.items[c.ref].type;
      const where = c.ref ? ` on "${String(label).slice(0, 60)}"` : ` at x:${c.x} y:${c.y}`;
      return done(store, board, [`Added comment id:${result}${where} as "${c.author.name}".${who.length ? ` Mentioned: ${who.join(', ')}.` : ''}`]);
    },
  },
  {
    name: 'reply_comment',
    title: 'Reply to a comment',
    description: 'Reply in an existing comment thread (find it with list_comments). The reply is signed with your agent name and shows up live. Replying to a resolved comment reopens it. Write @Name to mention someone. Returns which thread you replied to and who was mentioned. To start a new thread use add_comment.',
    annotations: ANN.write,
    inputSchema: { type: 'object', properties: { board: S.board, comment: { type: 'string', description: 'Comment id (from list_comments or read_board), or a unique part of its text' },
      text: { type: 'string', description: 'The reply (plain text, newlines allowed)' } }, required: ['board', 'comment', 'text'] },
    run(store, args, ctx = {}) {
      const id = resolveBoard(store, args.board);
      const members = teamMembers(store);
      const { board, result } = store.updateBoard(id, (b) => B.replyComment(b.doc, args.comment, { text: args.text, author: agentAuthor(ctx), members }));
      const c = board.doc.comments[result.comment];
      const who = mentionNames(members, c.replies[result.reply].mentions);
      return done(store, board, [`Replied to comment ${c.id} ("${String(c.text).split('\n')[0].slice(0, 60)}").${who.length ? ` Mentioned: ${who.join(', ')}.` : ''}`]);
    },
  },
  {
    name: 'resolve_comment',
    title: 'Resolve a comment',
    description: 'Mark a comment thread as resolved once you have done what it asked, or reopen it with reopen: true. Resolved threads stay on the board, hidden from the open list; nothing is deleted. Returns the comment id. To answer before resolving use reply_comment.',
    annotations: ANN.set,
    inputSchema: { type: 'object', properties: { board: S.board, comment: { type: 'string', description: 'Comment id or a unique part of its text' },
      reopen: { type: 'boolean', description: 'Reopen a resolved comment instead' } }, required: ['board', 'comment'] },
    run(store, args, ctx = {}) {
      const id = resolveBoard(store, args.board);
      const { board, result } = store.updateBoard(id, (b) => B.resolveComment(b.doc, args.comment, { author: agentAuthor(ctx), reopen: !!args.reopen }));
      return done(store, board, [`${args.reopen ? 'Reopened' : 'Resolved'} comment ${result}.`]);
    },
  },
  {
    name: 'export_board',
    title: 'Export or share a board',
    description: 'Save a board as a file the person can share: "html" is a single web page anyone can open in a browser (with zoom, no install), "pdf", "png" or "svg". The Mapache app renders it, so it opens in the browser if it is not open yet (and switches to that board). The board itself is not changed; the file never overwrites an existing one (a number is added to the name). Returns where the file was saved and its size.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: { board: S.board, format: { type: 'string', enum: ['html', 'pdf', 'png', 'svg'], description: 'html (default): one web page with zoom. pdf for printing, png for an image, svg for vector graphics' },
      path: { type: 'string', description: 'Folder or full file path to save to. Default: the Downloads folder' } }, required: ['board'] },
    async run(store, args, ctx = {}) {
      const id = resolveBoard(store, args.board);
      const format = ['html', 'pdf', 'png', 'svg'].includes(args.format) ? args.format : 'html';
      if (!ctx.exportBoard) fail('Exporting needs the Mapache app; run this from the MCP server or the command line');
      const buf = await ctx.exportBoard(id, format);
      const b = store.getBoard(id);
      const file = exportPath(args.path, `${titleOf(b).replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'board'}.${format}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      return `Saved "${titleOf(b)}" as ${format.toUpperCase()} (${Math.max(1, Math.round(buf.length / 1024))} KB): ${file}${format === 'html' ? '\nIt is a single file: send it by email or chat, or upload it anywhere; it opens in any browser.' : ''}`;
    },
  },
  {
    name: 'open_board',
    title: 'Open a board in the app',
    description: 'Open a board in Mapache in the person\'s browser (starting Mapache if needed), so they can see it; it does not change the board. Returns its address. Offer it after a big change; set launch to false to only get the link.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: { board: S.board, launch: { type: 'boolean', description: 'Open the browser (default true). false only returns the address' } } },
    async run(store, args, ctx = {}) {
      const id = resolveBoard(store, args.board);
      const url = ctx.open ? await ctx.open(id, args.launch !== false) : appURL(store, id);
      return `${args.launch === false ? 'Address' : 'Opened'}: ${url}`;
    },
  },
];

// Dónde guardar un archivo exportado: la carpeta o el archivo pedidos, o Descargas; nunca pisa uno que ya existe.
function exportPath(target, name) {
  const os = require('os');
  let file;
  if (target) {
    const t = path.resolve(String(target).replace(/^~(?=$|[\\/])/, os.homedir()));
    file = path.extname(t) && !(fs.existsSync(t) && fs.statSync(t).isDirectory()) ? t : path.join(t, name);
  } else {
    const dl = path.join(os.homedir(), 'Downloads');
    file = path.join(fs.existsSync(dl) ? dl : os.homedir(), name);
  }
  if (!fs.existsSync(file)) return file;
  const ext = path.extname(file), stem = file.slice(0, -ext.length);
  for (let i = 2; ; i++) if (!fs.existsSync(`${stem} (${i})${ext}`)) return `${stem} (${i})${ext}`;
}

async function call(name, args = {}, ctx = {}) {
  const tool = tools.find((t) => t.name === name);
  if (tool && ctx.user && ctx.user.role === 'viewer' && !(tool.annotations && tool.annotations.readOnlyHint)) {
    fail('Your role in this Mapache team is viewer: you can read boards but not change them', 403);
  }
  current = ctx.user || null;
  if (!tool) fail(`Unknown tool "${name}". Available: ${tools.map((t) => t.name).join(', ')}`, 404);
  const store = ctx.store || Store.open();
  return tool.run(store, args || {}, ctx);
}

module.exports = { tools, call, resolveBoard, resolveFolder, titleOf, appURL, serverInfo, agentAuthor, teamMembers };
