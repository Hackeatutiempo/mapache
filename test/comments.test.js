// Comentarios y menciones: fusión de hilos, menciones, bandeja, ayudas del tablero, herramientas, MCP y línea de comandos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { mergeDoc } = require('../src/merge.js');
const C = require('../src/comments.js');
const Store = require('../lib/store');
const B = require('../lib/board');
const Tools = require('../lib/tools');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mapache-comments-'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const node = (id, parentId, text, order = 1) => ({ id, parentId, order, lines: [text], block: 'p', checked: [], icon: null, style: {} });
const comment = (id, extra = {}) => ({ id, x: 10, y: 20, ref: null, author: { id: 'u1', name: 'Ana' }, text: 'Hola', mentions: [], createdAt: 1, replies: {}, resolved: false, ...extra });
const reply = (id, text, who = 'u2') => ({ id, author: { id: who, name: who }, text, mentions: [], createdAt: 2 });
const docWith = (comments) => ({ rootId: 'r', settings: { layout: 'horizontal', lines: 'curvy' }, nodes: { r: node('r', null, 'Centro') }, items: {}, ...(comments ? { comments } : {}) });
const USERS = { users: [{ id: 'u1', name: 'Ana María', email: 'a@example.com', role: 'owner' }, { id: 'u2', name: 'Ana', email: 'b@example.com', role: 'editor' }] };

test('merge: two replies written at the same time both survive', () => {
  const base = docWith({ c1: comment('c1') });
  const ours = clone(base); ours.comments.c1.replies.r1 = reply('r1', 'Mine');
  const theirs = clone(base); theirs.comments.c1.replies.r2 = reply('r2', 'Theirs');
  const m = mergeDoc(base, ours, theirs);
  assert.deepStrictEqual(Object.keys(m.comments.c1.replies).sort(), ['r1', 'r2']);
  assert.strictEqual(m.comments.c1.replies.r2.text, 'Theirs');
});

test('merge: resolving on one side and replying on the other keeps both', () => {
  const base = docWith({ c1: comment('c1') });
  const ours = clone(base); Object.assign(ours.comments.c1, { resolved: true, resolvedBy: { id: 'u1', name: 'Ana' }, resolvedAt: 5 });
  const theirs = clone(base); theirs.comments.c1.replies.r1 = reply('r1', 'One more thing');
  for (const m of [mergeDoc(base, ours, theirs), mergeDoc(base, theirs, ours)]) {
    assert.strictEqual(m.comments.c1.resolved, true);
    assert.strictEqual(m.comments.c1.resolvedBy.name, 'Ana');
    assert.strictEqual(m.comments.c1.replies.r1.text, 'One more thing');
  }
});

test('merge: comments from both sides, an edit beats a deletion, boards without comments stay as they were', () => {
  const base = docWith({ c1: comment('c1') });
  const ours = clone(base); ours.comments.c2 = comment('c2', { text: 'Mine' }); delete ours.comments.c1;
  const theirs = clone(base); theirs.comments.c3 = comment('c3', { text: 'Theirs' }); theirs.comments.c1.replies.r1 = reply('r1', 'Still here');
  const m = mergeDoc(base, ours, theirs);
  assert.deepStrictEqual(Object.keys(m.comments).sort(), ['c1', 'c2', 'c3']);
  assert.ok(m.comments.c1.replies.r1);
  const old = docWith();
  assert.ok(!('comments' in mergeDoc(old, clone(old), clone(old))));
});

test('mentions: @Name with the longest names first, any case or accents, never part of a word', () => {
  const members = USERS.users;
  assert.deepStrictEqual(C.mentionIds('Hola @Ana María, ¿lo ves?', members), ['u1']);
  assert.deepStrictEqual(C.mentionIds('@ana maria y @Ana', members).sort(), ['u1', 'u2']);
  assert.deepStrictEqual(C.mentionIds('@Anabel no es nadie', members), []);
  assert.deepStrictEqual(C.mentionIds('escribe a bob@ana.com', members), []);
  assert.deepStrictEqual(C.mentionIds('sin menciones', []), []);
});

test('inbox: mentions of me on every board, never my own, and by name without accounts', () => {
  const boards = [
    { id: 'b1', title: 'One', doc: docWith({ c1: comment('c1', { text: '@Bea mira', mentions: ['me'], createdAt: 10, replies: { r1: { ...reply('r1', 'yo también @Bea'), author: { id: 'me', name: 'Bea' }, mentions: ['me'] } } }) }) },
    { id: 'b2', title: 'Two', doc: docWith({ c2: comment('c2', { author: { id: 'agent', name: 'Claude Code' }, text: 'Hecho, @Bea', createdAt: 20 }) }) },
    { id: 'b3', title: 'Old', doc: docWith() },
  ];
  const team = C.inbox(boards, { id: 'me', name: 'Bea' });
  assert.deepStrictEqual(team.map((e) => e.key), ['b1/c1']);
  const local = C.inbox(boards, { id: 'me', name: 'Bea' }, { byName: true });
  assert.deepStrictEqual(local.map((e) => e.key), ['b2/c2', 'b1/c1']);
  assert.strictEqual(local[0].boardId, 'b2');
});

test('board: comments on a node, an item, a point or free space; replies, resolving and describe', () => {
  const d = B.newDoc('Plan');
  B.addTree(d, d.rootId, B.parseOutline('Ideas\nTasks'));
  const [note] = B.addItems(d, [{ type: 'note', text: 'Budget' }]);
  const author = { id: 'agent', name: 'Claude Code' };
  const onNode = B.addComment(d, { text: 'Rename this?', on: 'Ideas', author });
  const onNote = B.addComment(d, { text: 'Check @Ana', on: 'Budget', author, members: USERS.users });
  const second = B.addComment(d, { text: 'And this', on: note, author });
  const atPoint = B.addComment(d, { text: 'Here', x: 500, y: -300, author });
  const free = B.addComment(d, { text: 'Anywhere', author });
  const c = d.comments;
  assert.ok(c[onNode].ref.startsWith('node:'));
  assert.strictEqual(c[onNote].ref, note);
  assert.deepStrictEqual(c[onNote].mentions, ['u2']);
  assert.strictEqual(c[onNote].x, d.items[note].x + c[onNote].dx);
  assert.ok(Math.abs(c[second].dx - c[onNote].dx) >= 34, 'a second pin on the same item does not cover the first');
  assert.deepStrictEqual([c[atPoint].x, c[atPoint].y, c[atPoint].ref], [500, -300, null]);
  assert.ok(Number.isFinite(c[free].x) && c[free].ref === null);
  assert.throws(() => B.addComment(d, { text: '  ' }), /empty/);
  assert.throws(() => B.addComment(d, { text: 'x', on: 'nothing like this' }), /Nothing called/);

  const { reply: rid } = B.replyComment(d, 'Rename', { text: 'Yes, to "Ideas & notes"', author: { id: 'u1', name: 'Ana María' } });
  assert.strictEqual(c[onNode].replies[rid].author.name, 'Ana María');
  B.resolveComment(d, onNode, { author });
  assert.strictEqual(c[onNode].resolved, true);
  B.replyComment(d, onNode.slice(0, 8), { text: 'Reopening', author });
  assert.strictEqual(c[onNode].resolved, false, 'a reply reopens a resolved thread');
  B.resolveComment(d, onNode, { author });
  B.resolveComment(d, atPoint, { author });
  B.resolveComment(d, atPoint, { reopen: true });
  assert.strictEqual(c[atPoint].resolved, false);
  assert.throws(() => B.findComment(d, 'nope nope'), /No comment matches/);

  const text = B.describe({ id: 'b', title: 'Plan', doc: d });
  assert.match(text, /## Comments \(4\)/);
  assert.match(text, /- Claude Code on "Budget" .*\{id:/);
  assert.match(text, /Check @Ana/);
  assert.doesNotMatch(text, /Rename this\?/, 'resolved comments are left out');
  assert.match(B.describeComments(d, { includeResolved: true }), /resolved by Claude Code[\s\S]*↳ Ana María/);
  assert.strictEqual(B.counts(d).comments, 4);
});

test('board: deleting what a comment points to leaves the comment where it was', () => {
  const d = B.newDoc('Plan');
  const [branch] = B.addTree(d, d.rootId, [{ text: 'Branch', children: [] }]);
  const [note] = B.addItems(d, [{ type: 'note', text: 'Note' }]);
  const a = B.addComment(d, { text: 'On the note', on: note });
  const b = B.addComment(d, { text: 'On the branch', on: branch });
  const pa = { x: d.comments[a].x, y: d.comments[a].y }, pb = { x: d.comments[b].x, y: d.comments[b].y };
  B.deleteItems(d, [note]);
  B.deleteNodes(d, [branch]);
  assert.deepStrictEqual([d.comments[a].ref, d.comments[a].x, d.comments[a].y, d.comments[a].dx], [null, pa.x, pa.y, undefined]);
  assert.deepStrictEqual([d.comments[b].ref, d.comments[b].x, d.comments[b].y], [null, pb.x, pb.y]);
});

test('tools: add, reply, resolve and list comments; the agent signs them and mentions team members', async () => {
  const store = Store.open(tmp());
  fs.writeFileSync(path.join(store.dir, 'users.json'), JSON.stringify(USERS));
  const ctx = { store, client: { name: 'claude-code', version: '2' } };
  const call = (name, args, c = ctx) => Tools.call(name, args, c);
  await call('create_board', { title: 'Plan', outline: 'Plan\n  Ideas' });
  assert.match(await call('list_comments', { board: 'Plan' }), /No comments/);
  const added = await call('add_comment', { board: 'Plan', text: 'Can you check this, @Ana María?', on: 'Ideas' });
  assert.match(added, /Added comment id:[\w-]+ on "Ideas" as "Claude Code"\. Mentioned: Ana María\./);
  const id = added.match(/id:([\w-]+)/)[1];
  assert.match(await call('reply_comment', { board: 'Plan', comment: id, text: 'On it @Ana' }, { store, client: { name: 'Codex' } }), /Replied to comment .*Mentioned: Ana\./);
  await call('add_comment', { board: 'Plan', text: 'Second one', x: 10, y: 10 }, { store });
  const list = await call('list_comments', { board: 'Plan' });
  assert.match(list, /2 open comment\(s\) on "Plan":/);
  assert.match(list, /Claude Code on "Ideas"/);
  assert.match(list, /↳ Codex · .*On it @Ana/);
  assert.match(list, /AI agent at x:10 y:10/);
  assert.match(await call('resolve_comment', { board: 'Plan', comment: 'Second one' }), /Resolved comment/);
  assert.match(await call('list_comments', { board: 'Plan' }), /1 open comment\(s\) on "Plan", 1 resolved \(pass include_resolved/);
  assert.match(await call('list_comments', { board: 'Plan', include_resolved: true }), /Second one/);
  assert.match(await call('resolve_comment', { board: 'Plan', comment: 'Second', reopen: true }), /Reopened/);
  assert.match(await call('read_board', { board: 'Plan' }), /## Comments \(2\)/);
  assert.match(await call('list_boards', {}), /2 open comment\(s\)/);
  assert.match(await call('search_boards', { query: 'on it' }), /comment by Claude Code/);
  const doc = store.getBoard(store.listBoards()[0].id).doc;
  const c = doc.comments[id];
  assert.deepStrictEqual(c.author, { id: 'agent', name: 'Claude Code' });
  assert.deepStrictEqual(c.mentions, ['u1']);
  assert.deepStrictEqual(Object.values(c.replies)[0].mentions, ['u2']);
  await assert.rejects(call('reply_comment', { board: 'Plan', comment: 'zzz', text: 'x' }), /No comment matches/);
  // Sin users.json (sin servidor de equipo) nadie queda mencionado.
  const solo = Store.open(tmp());
  await Tools.call('create_board', { title: 'Solo' }, { store: solo });
  assert.doesNotMatch(await Tools.call('add_comment', { board: 'Solo', text: '@Ana hi' }, { store: solo }), /Mentioned/);
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
  return { rpc, close: () => p.kill() };
}

test('mcp: the comment tools are listed and the client that connected signs the comments', async () => {
  const dir = tmp();
  const s = mcpSession(dir);
  try {
    await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
    const names = (await s.rpc('tools/list', {})).result.tools.map((t) => t.name);
    for (const n of ['list_comments', 'add_comment', 'reply_comment', 'resolve_comment']) assert.ok(names.includes(n), n);
    await s.rpc('tools/call', { name: 'create_board', arguments: { title: 'MCP board' } });
    const out = await s.rpc('tools/call', { name: 'add_comment', arguments: { board: 'MCP board', text: 'From the agent' } });
    assert.match(out.result.content[0].text, /as "Claude Code"/);
    const other = await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'some-client', title: 'Some Client' } });
    assert.ok(other.result);
    const out2 = await s.rpc('tools/call', { name: 'add_comment', arguments: { board: 'MCP board', text: 'Again' } });
    assert.match(out2.result.content[0].text, /as "Some Client"/);
  } finally { s.close(); }
});

test('cli: mapache comment and mapache comments', () => {
  const dir = tmp();
  const env = { ...process.env, MAPACHE_DATA: dir };
  const cli = (...a) => execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'mapache.js'), ...a], { env, encoding: 'utf8' });
  cli('new', 'CLI board', '--outline', 'Root\n  Branch');
  assert.match(cli('help'), /comment <board> <text>/);
  assert.match(cli('comment', 'CLI board', 'Look', 'at', 'this', '--on', 'Branch'), /Added comment id:[\w-]+ on "Branch" as "Command line"/);
  const list = cli('comments', 'CLI board');
  assert.match(list, /1 open comment\(s\)/);
  assert.match(list, /Command line on "Branch"/);
  assert.match(list, /Look at this/);
});
