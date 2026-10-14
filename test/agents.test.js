// Tableros en archivos, fusión de cambios, herramientas para agentes, línea de comandos y servidor MCP.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { mergeDoc, mergeBoard, same } = require('../src/merge.js');
const Store = require('../lib/store');
const B = require('../lib/board');
const Tools = require('../lib/tools');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mapache-test-'));
const node = (id, parentId, text, order = 1) => ({ id, parentId, order, lines: [text], block: 'p', checked: [], icon: null, style: {} });
const baseDoc = () => ({ rootId: 'r', settings: { layout: 'horizontal', lines: 'curvy' }, nodes: { r: node('r', null, 'Centro'), a: node('a', 'r', 'A') }, items: {} });
const clone = (v) => JSON.parse(JSON.stringify(v));

test('merge: each side adds different nodes and both survive', () => {
  const base = baseDoc();
  const ours = clone(base); ours.nodes.b = node('b', 'r', 'Mine', 2);
  const theirs = clone(base); theirs.nodes.c = node('c', 'r', 'Agent', 3);
  const m = mergeDoc(base, ours, theirs);
  assert.deepStrictEqual(Object.keys(m.nodes).sort(), ['a', 'b', 'c', 'r']);
});

test('merge: field level, and ours wins a real conflict', () => {
  const base = baseDoc();
  const ours = clone(base); ours.nodes.a.lines = ['A mine']; ours.nodes.a.style.color = 'blue';
  const theirs = clone(base); theirs.nodes.a.lines = ['A agent']; theirs.nodes.a.icon = '🔥';
  const m = mergeDoc(base, ours, theirs);
  assert.deepStrictEqual(m.nodes.a.lines, ['A mine']);
  assert.strictEqual(m.nodes.a.icon, '🔥');
  assert.strictEqual(m.nodes.a.style.color, 'blue');
});

test('merge: a deletion on one side wins over no change, but not over an edit', () => {
  const base = baseDoc();
  const ours = clone(base); delete ours.nodes.a;
  assert.ok(!mergeDoc(base, ours, clone(base)).nodes.a);
  const theirs = clone(base); theirs.nodes.a.lines = ['edited'];
  assert.deepStrictEqual(mergeDoc(base, ours, theirs).nodes.a.lines, ['edited']);
});

test('merge: children added under a branch the other side deleted bring the branch back', () => {
  const base = baseDoc();
  const ours = clone(base); delete ours.nodes.a;
  const theirs = clone(base); theirs.nodes.k = node('k', 'a', 'Kid');
  const m = mergeDoc(base, ours, theirs);
  assert.ok(m.nodes.a && m.nodes.k && m.nodes.k.parentId === 'a');
});

test('merge: board metadata and stable equality', () => {
  const base = { id: 'x', title: 'T', folderId: null, doc: baseDoc(), updatedAt: 1 };
  const ours = { ...clone(base), title: 'Mine', updatedAt: 3 };
  const theirs = { ...clone(base), folderId: 'f1', updatedAt: 2 };
  const m = mergeBoard(base, ours, theirs);
  assert.strictEqual(m.title, 'Mine');
  assert.strictEqual(m.folderId, 'f1');
  assert.strictEqual(m.updatedAt, 3);
  assert.ok(same({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }));
});

test('store: revisions, conflicts, trash and folders', () => {
  const s = Store.open(tmp());
  const b = s.putBoard({ id: 'b1', title: 'One', doc: baseDoc() });
  assert.strictEqual(b.rev, 1);
  assert.strictEqual(s.putBoard({ ...b, title: 'Two' }, { baseRev: 1 }).rev, 2);
  assert.throws(() => s.putBoard({ ...b, title: 'Stale' }, { baseRev: 1 }), (e) => e.status === 409 && e.current.title === 'Two');
  assert.throws(() => s.putBoard({ id: 'b1', doc: baseDoc() }, { baseRev: null }), (e) => e.status === 409);
  assert.throws(() => s.getBoard('../escape'), /Invalid id/);
  const { board } = s.updateBoard('b1', (x) => { x.title = 'Three'; });
  assert.strictEqual(board.rev, 3);
  assert.strictEqual(s.listBoards()[0].doc, undefined);
  s.removeBoard('b1');
  assert.strictEqual(s.getBoard('b1'), null);
  assert.strictEqual(s.listTrash()[0].id, 'b1');
  assert.strictEqual(s.restoreBoard('b1').title, 'Three');
  s.putFolder({ id: 'f1', name: 'Work', parentId: null });
  assert.strictEqual(s.readFolders().folders.length, 1);
  s.removeFolder('f1');
  assert.strictEqual(s.readFolders().folders.length, 0);
});

test('board: markdown text to the app format and back', () => {
  const t = B.textToLines('# Title\n- **bold** item\n[x] done\nPlain <b>tag</b> & [link](https://example.com)');
  assert.deepStrictEqual(t.blocks, ['h1', 'ul', 'check', 'p']);
  assert.deepStrictEqual(t.checked, [false, false, true, false]);
  assert.strictEqual(t.lines[1], '<b>bold</b> item');
  assert.match(t.lines[3], /^Plain &lt;b&gt;tag&lt;\/b&gt; &amp; <a href="https:\/\/example.com"/);
  assert.strictEqual(B.linesToText(t), '# Title\n- **bold** item\n[x] done\nPlain <b>tag</b> & [link](https://example.com)');
  assert.strictEqual(B.textToLines('javascript:[x](javascript:alert(1))').lines[0], 'javascript:[x](javascript:alert(1))');
});

test('board: outline parsing, branch colors, find by text or path', () => {
  const tree = B.parseOutline('Root\n\t- One\n\t\t* Deep\n\t2. Two\n  Tab');
  assert.strictEqual(tree.length, 1);
  assert.deepStrictEqual(tree[0].children.map((c) => c.text), ['One', 'Two', 'Tab']);
  const d = B.newDoc('Root');
  const ids = B.addTree(d, d.rootId, tree[0].children);
  assert.strictEqual(ids.length, 4);
  const colors = B.kidsOf(d, d.rootId).map((n) => n.style.color);
  assert.deepStrictEqual(colors, ['purple', 'blue', 'green']);
  assert.strictEqual(B.findNode(d, 'deep'), ids[1]);
  assert.strictEqual(B.findNode(d, 'Root > One > Deep'), ids[1]);
  assert.throws(() => B.findNode(d, 'nothing here'), /No node matches/);
  B.addTree(d, ids[0], [{ text: 'Two', children: [] }]);
  assert.throws(() => B.findNode(d, 'Two'), /Several nodes/);
});

test('board: new items do not overlap what is already there', () => {
  const d = B.newDoc('Root');
  B.addTree(d, d.rootId, B.parseOutline('A\nB\nC\nD'));
  B.addItems(d, [{ type: 'note', text: 'n1' }, { type: 'note', text: 'n2' }, { type: 'shape', shape: 'diamond', text: '?' }]);
  B.addMindmap(d, 'Second\n  x\n  y');
  const rects = [...B.rootIdsOf(d).map((r) => B.mapBounds(d, r)), ...Object.values(d.items).map(B.itemBounds)];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), `overlap ${i} ${j}`);
    }
  }
  assert.throws(() => B.addItems(d, [{ type: 'note', color: 'neon' }]), /Unknown note color/);
  assert.throws(() => B.addItems(d, [{ type: 'chart', table: 'nope' }]), /needs "table"/);
});

test('tools: a whole agent session on a fresh folder', async () => {
  const store = Store.open(tmp());
  const call = (name, args) => Tools.call(name, args, { store });
  assert.match(await call('create_board', { title: 'Plan', outline: 'Plan\n  Ideas\n  Tasks', folder: 'Work / Q1' }), /Created board "Plan"/);
  assert.match(await call('add_nodes', { board: 'plan', parent: 'Ideas', outline: 'One\n  One.a\nTwo' }), /Added 3 node/);
  await call('update_nodes', { board: 'Plan', updates: [{ node: 'Two', text: 'Two **bold**', icon: '⭐' }, { node: 'Tasks', checked: true }] });
  await call('add_items', { board: 'Plan', items: [{ type: 'note', text: 'Remember' }, { type: 'table', rows: [['k', 'v'], ['a', 1]] }] });
  const read = await call('read_board', { board: 'Plan' });
  assert.match(read, /- Two \*\*bold\*\*/);
  assert.match(read, /icon:⭐/);
  assert.match(read, /\| k \| v \|/);
  const tableId = read.match(/Table \{id:([\w-]+)/)[1];
  await call('add_items', { board: 'Plan', items: [{ type: 'chart', table: tableId, kind: 'pie' }] });
  await call('connect', { board: 'Plan', connections: [{ from: 'Remember', to: 'One.a', label: 'see' }] });
  assert.match(await call('read_board', { board: 'Plan' }), /"Remember" → "One\.a" "see"/);
  await call('move_node', { board: 'Plan', node: 'One.a', parent: 'Tasks' });
  await call('delete_nodes', { board: 'Plan', nodes: ['Ideas'] });
  const after = await call('read_board', { board: 'Plan' });
  assert.doesNotMatch(after, /- One \{|- Two/);
  assert.match(after, /One\.a/);
  assert.match(await call('search_boards', { query: 'remember' }), /note "Remember"/);
  assert.match(await call('list_boards', {}), /folder:"Work \/ Q1"/);
  await assert.rejects(call('read_board', { board: 'nope' }), /No board matches/);
  assert.match(await call('delete_board', { board: 'Plan' }), /trash/);
});

test('tools: export_board saves what the app renders, without overwriting', async () => {
  const store = Store.open(tmp());
  const out = tmp();
  const asked = [];
  const ctx = { store, exportBoard: async (id, format) => { asked.push([id, format]); return Buffer.from(`<!doctype html>${format}`); } };
  await Tools.call('create_board', { title: 'Share: me / now?' }, ctx);
  const first = await Tools.call('export_board', { board: 'Share', path: out }, ctx);
  const second = await Tools.call('export_board', { board: 'Share', path: out, format: 'pdf' }, ctx);
  const third = await Tools.call('export_board', { board: 'Share', path: out }, ctx);
  assert.deepStrictEqual(asked.map((a) => a[1]), ['html', 'pdf', 'html']);
  assert.deepStrictEqual(fs.readdirSync(out).sort(), ['Share me  now (2).html', 'Share me  now.html', 'Share me  now.pdf']);
  assert.match(first, /opens in any browser/);
  assert.match(second, /as PDF/);
  assert.match(third, /\(2\)\.html/);
  const named = path.join(out, 'custom.html');
  await Tools.call('export_board', { board: 'Share', path: named }, ctx);
  assert.ok(fs.existsSync(named));
  await assert.rejects(Tools.call('export_board', { board: 'Share' }, { store }), /needs the Mapache app/);
});

// Cliente MCP mínimo: arranca `mapache mcp` y habla JSON-RPC por stdio.
function mcpSession(dataDir) {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'mapache.js'), 'mcp'], { env: { ...process.env, MAPACHE_DATA: dataDir }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const waiting = new Map();
  p.stdout.on('data', (c) => {
    buf += c;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    }
  });
  let id = 0;
  const rpc = (method, params) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`); });
  const notify = (method) => p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  return { rpc, notify, close: () => p.kill() };
}

test('mcp: handshake, tool list and calls over stdio', async () => {
  const dir = tmp();
  const s = mcpSession(dir);
  try {
    const init = await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.strictEqual(init.result.protocolVersion, '2025-06-18');
    assert.strictEqual(init.result.serverInfo.name, 'mapache');
    assert.ok(init.result.capabilities.tools);
    s.notify('notifications/initialized');
    const list = await s.rpc('tools/list', {});
    const names = list.result.tools.map((t) => t.name);
    for (const n of ['list_boards', 'read_board', 'create_board', 'add_nodes', 'add_items', 'connect', 'export_board', 'open_board']) assert.ok(names.includes(n), n);
    for (const t of list.result.tools) assert.strictEqual(t.inputSchema.type, 'object');
    const made = await s.rpc('tools/call', { name: 'create_board', arguments: { title: 'From MCP', outline: 'From MCP\n  Child' } });
    assert.match(made.result.content[0].text, /Created board/);
    const bad = await s.rpc('tools/call', { name: 'read_board', arguments: { board: 'missing' } });
    assert.strictEqual(bad.result.isError, true);
    assert.strictEqual((await s.rpc('nope/method', {})).error.code, -32601);
    assert.strictEqual((await s.rpc('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-11-25');
  } finally { s.close(); }
  assert.strictEqual(Store.open(dir).listBoards()[0].title, 'From MCP');
});

test('cli: commands print readable results', () => {
  const dir = tmp();
  const env = { ...process.env, MAPACHE_DATA: dir };
  const cli = (...a) => execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'mapache.js'), ...a], { env, encoding: 'utf8' });
  assert.match(cli('help'), /mapache <command>/);
  assert.strictEqual(cli('where').trim(), path.resolve(dir));
  cli('new', 'CLI board', '--outline', 'Root\n  A');
  assert.match(cli('add', 'CLI board', 'A', 'B', 'C'), /Added 2 node/);
  assert.match(cli('tool', 'add_items', '{"board":"CLI board","items":[{"type":"text","text":"hello"}]}'), /Added 1 item/);
  assert.match(cli('show', 'CLI board'), /- B/);
  assert.match(cli('mcp-config', 'claude-code'), /claude mcp add --scope user mapache/);
});
