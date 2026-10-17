// Modo equipo: cuentas, sesiones, invitaciones, roles, tokens para agentes y presencia (arranca un servidor de prueba).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const Auth = require('../lib/auth');

const ROOT = path.join(__dirname, '..');
const PORT = 4700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mapache-team-'));
let server, setupCode;

// Petición HTTP con control total de las cabeceras (Origin, Cookie, Host).
function req(method, url, { body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(raw ? body : JSON.stringify(body));
    const r = http.request(`${BASE}${url}`, { method, headers: { ...(data && !raw ? { 'Content-Type': 'application/json' } : {}), ...(data ? { 'Content-Length': data.length } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* no es JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const cookieOf = (r) => (r.headers['set-cookie'] || [])[0].split(';')[0];
const as = (cookie) => ({ Cookie: cookie, Origin: ORIGIN });

test.before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--no-star'], { env: { ...process.env, MAPACHE_MODE: 'team', MAPACHE_DATA: DATA, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server did not start: ${out}`)), 8000);
    server.stdout.on('data', (d) => { out += d; const m = out.match(/(?:Setup code to create the admin account|Código para crear la cuenta de admin): (\d+)/); if (m) { setupCode = m[1]; clearTimeout(t); resolve(); } });
    server.stderr.on('data', (d) => { out += d; });
  });
});
test.after(() => { if (server) server.kill(); });

let admin, editorCookie, viewerCookie;

test('team: the first admin needs the setup code from the log', async () => {
  const info = await req('GET', '/api/info');
  assert.strictEqual(info.json.mode, 'team');
  assert.strictEqual(info.json.needsSetup, true);
  assert.strictEqual(info.json.dataDir, undefined);
  assert.strictEqual((await req('GET', '/api/boards')).status, 401);
  const bad = await req('POST', '/api/auth/setup', { body: { code: '000000', email: 'ana@example.com', password: 'secret-pass' }, headers: { Origin: ORIGIN } });
  assert.strictEqual(bad.status, 403);
  const ok = await req('POST', '/api/auth/setup', { body: { code: setupCode, email: 'ana@example.com', name: 'Ana', password: 'secret-pass' }, headers: { Origin: ORIGIN } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.json.user.role, 'admin');
  const cookie = cookieOf(ok);
  assert.match(ok.headers['set-cookie'][0], /HttpOnly/);
  assert.match(ok.headers['set-cookie'][0], /SameSite=Lax/);
  admin = cookie;
  const again = await req('POST', '/api/auth/setup', { body: { code: setupCode, email: 'eve@example.com', password: 'secret-pass' }, headers: { Origin: ORIGIN } });
  assert.strictEqual(again.status, 409);
  const me = await req('GET', '/api/info', { headers: { Cookie: admin } });
  assert.strictEqual(me.json.user.name, 'Ana');
  assert.ok(me.json.dataDir);
});

test('team: boards need a session and cookie writes need the app origin', async () => {
  const board = { id: 'b1', title: 'Team board', doc: { rootId: 'r', settings: {}, nodes: { r: { id: 'r', parentId: null, order: 1, lines: ['Root'] } }, items: {} } };
  assert.strictEqual((await req('PUT', '/api/boards/b1', { body: { board, baseRev: null }, headers: { Cookie: admin, Origin: 'https://evil.example' } })).status, 403);
  assert.strictEqual((await req('PUT', '/api/boards/b1', { body: { board, baseRev: null }, headers: { Cookie: admin } })).status, 403);
  const put = await req('PUT', '/api/boards/b1', { body: { board, baseRev: null }, headers: as(admin) });
  assert.strictEqual(put.status, 200);
  assert.strictEqual((await req('GET', '/api/boards', { headers: { Cookie: admin } })).json.length, 1);
});

test('team: invitations create accounts with their role; viewers cannot write', async () => {
  const inv = await req('POST', '/api/team/invites', { body: { role: 'editor' }, headers: as(admin) });
  assert.strictEqual(inv.status, 200);
  const token = decodeURIComponent(inv.json.link.split('#invite=')[1]);
  assert.strictEqual((await req('GET', `/api/auth/invite/${encodeURIComponent(token)}`)).json.role, 'editor');
  const acc = await req('POST', '/api/auth/accept', { body: { token, email: 'luis@example.com', name: 'Luis', password: 'another-pass' }, headers: { Origin: ORIGIN } });
  assert.strictEqual(acc.status, 200);
  editorCookie = cookieOf(acc);
  assert.strictEqual((await req('POST', '/api/auth/accept', { body: { token, email: 'x@example.com', password: 'another-pass' }, headers: { Origin: ORIGIN } })).status, 410);
  const vinv = await req('POST', '/api/team/invites', { body: { role: 'viewer', email: 'vera@example.com' }, headers: as(admin) });
  const vtoken = decodeURIComponent(vinv.json.link.split('#invite=')[1]);
  assert.strictEqual((await req('POST', '/api/auth/accept', { body: { token: vtoken, email: 'other@example.com', password: 'viewer-pass' }, headers: { Origin: ORIGIN } })).status, 403);
  const vacc = await req('POST', '/api/auth/accept', { body: { token: vtoken, email: 'vera@example.com', name: 'Vera', password: 'viewer-pass' }, headers: { Origin: ORIGIN } });
  viewerCookie = cookieOf(vacc);
  const b = (await req('GET', '/api/boards/b1', { headers: { Cookie: viewerCookie } })).json;
  assert.strictEqual(b.title, 'Team board');
  assert.strictEqual((await req('PUT', '/api/boards/b1', { body: { board: b, baseRev: b.rev }, headers: as(viewerCookie) })).status, 403);
  assert.strictEqual((await req('PUT', '/api/boards/b1', { body: { board: { ...b, title: 'Edited' }, baseRev: b.rev }, headers: as(editorCookie) })).status, 200);
  assert.strictEqual((await req('POST', '/api/team/invites', { body: { role: 'admin' }, headers: as(editorCookie) })).status, 403);
  // Lo que ve cada uno del equipo: admin ve emails; los demás, solo nombres.
  const asAdmin = (await req('GET', '/api/team', { headers: { Cookie: admin } })).json;
  const asEditor = (await req('GET', '/api/team', { headers: { Cookie: editorCookie } })).json;
  assert.strictEqual(asAdmin.users.length, 3);
  assert.ok(asAdmin.users.every((u) => u.email));
  assert.ok(asEditor.users.filter((u) => u.name !== 'Luis').every((u) => !u.email));
  assert.strictEqual(asEditor.invites, undefined);
});

test('team: agents use personal tokens; a viewer token can only read', async () => {
  const t = await req('POST', '/api/me/tokens', { body: { name: 'Claude' }, headers: as(editorCookie) });
  const token = t.json.token;
  assert.match(token, /^mpk_/);
  const mcp = (tok, body) => req('POST', '/mcp', { body, headers: { Authorization: `Bearer ${tok}` } });
  assert.strictEqual((await mcp('mpk_wrong', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  const list = await mcp(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.ok(list.json.result.tools.length >= 18);
  const made = await mcp(token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_board', arguments: { title: 'From the agent' } } });
  assert.match(made.json.result.content[0].text, /Created board/);
  const vt = (await req('POST', '/api/me/tokens', { body: { name: 'Viewer agent' }, headers: as(viewerCookie) })).json.token;
  const denied = await mcp(vt, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_board', arguments: { title: 'Nope' } } });
  assert.strictEqual(denied.json.result.isError, true);
  assert.match(denied.json.result.content[0].text, /viewer/);
  const read = await mcp(vt, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_boards', arguments: {} } });
  assert.match(read.json.result.content[0].text, /From the agent/);
  // Revocar el token lo deja sin acceso.
  const mine = (await req('GET', '/api/me/tokens', { headers: { Cookie: editorCookie } })).json.tokens;
  await req('DELETE', `/api/me/tokens/${mine[0].id}`, { headers: as(editorCookie) });
  assert.strictEqual((await mcp(token, { jsonrpc: '2.0', id: 5, method: 'tools/list' })).status, 401);
});

test('team: profile, roles, logout and too many wrong passwords', async () => {
  const p = await req('PATCH', '/api/me', { body: { name: 'Luis G.' }, headers: as(editorCookie) });
  assert.strictEqual(p.json.user.name, 'Luis G.');
  assert.strictEqual((await req('PATCH', '/api/me', { body: { password: 'new-password', currentPassword: 'wrong' }, headers: as(editorCookie) })).status, 403);
  const users = (await req('GET', '/api/team', { headers: { Cookie: admin } })).json.users;
  const anaId = users.find((u) => u.email === 'ana@example.com').id;
  assert.strictEqual((await req('PATCH', `/api/team/users/${anaId}`, { body: { role: 'editor' }, headers: as(admin) })).status, 400); // el único admin
  await req('POST', '/api/auth/logout', { body: {}, headers: as(editorCookie) });
  assert.strictEqual((await req('GET', '/api/boards', { headers: { Cookie: editorCookie } })).status, 401);
  let last;
  for (let i = 0; i < 11; i++) last = await req('POST', '/api/auth/login', { body: { email: 'ana@example.com', password: 'nope' }, headers: { Origin: ORIGIN } });
  assert.strictEqual(last.status, 429);
});

test('team: presence and cursors reach the others on the same board', async () => {
  const events = (cookie) => new Promise((resolve) => {
    const r = http.request(`${BASE}/api/events`, { headers: { Cookie: cookie } }, (res) => {
      let buf = '';
      const got = [];
      res.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); const ev = (block.match(/^event: (.+)$/m) || [])[1]; const data = (block.match(/^data: (.+)$/m) || [])[1]; if (ev) got.push([ev, data ? JSON.parse(data) : null]); } });
      resolve({ got, close: () => r.destroy() });
    });
    r.end();
  });
  const a = await events(admin);
  const v = await events(viewerCookie);
  await new Promise((r) => setTimeout(r, 300));
  const cidA = a.got.find(([e]) => e === 'hello')[1].cid;
  const cidV = v.got.find(([e]) => e === 'hello')[1].cid;
  await req('PUT', '/api/session', { body: { openBoard: 'b1', cid: cidA }, headers: as(admin) });
  await req('PUT', '/api/session', { body: { openBoard: 'b1', cid: cidV }, headers: as(viewerCookie) });
  await req('POST', '/api/cursor', { body: { cid: cidA, board: 'b1', x: 120, y: 80 }, headers: as(admin) });
  await new Promise((r) => setTimeout(r, 300));
  const pres = v.got.filter(([e]) => e === 'presence').pop()[1].people;
  assert.ok(pres.some((p) => p.name === 'Ana' && p.board === 'b1'));
  const cur = v.got.find(([e]) => e === 'cursor');
  assert.ok(cur && cur[1].name === 'Ana' && cur[1].x === 120);
  assert.ok(!a.got.some(([e]) => e === 'cursor'), 'you do not get your own cursor');
  a.close(); v.close();
});

test('team: without accounts, Mapache refuses to listen on the network', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server.js'), '--no-star'], { env: { ...process.env, MAPACHE_DATA: DATA, PORT: String(PORT + 1), HOST: '0.0.0.0', MAPACHE_MODE: '' }, encoding: 'utf8', timeout: 8000 });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /team mode|modo equipo/);
});

test('auth: passwords are hashed with scrypt and checked in constant time', () => {
  const h = Auth.hashPassword('correct horse');
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.ok(Auth.checkPassword('correct horse', h));
  assert.ok(!Auth.checkPassword('wrong', h));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapache-auth-'));
  const a = Auth.open(dir);
  assert.throws(() => a.createUser({ email: 'not-an-email', password: 'long-enough' }), /email/);
  assert.throws(() => a.createUser({ email: 'a@b.co', password: 'short' }), /8 characters/);
  const u = a.createUser({ email: 'A@B.co', password: 'long-enough' });
  assert.strictEqual(u.email, 'a@b.co');
  assert.strictEqual(u.pass, undefined);
  assert.ok(a.verify('a@b.co', 'long-enough'));
  assert.strictEqual(a.verify('a@b.co', 'nope'), null);
  const t = a.createSession(u.id);
  assert.strictEqual(a.sessionUser(t).id, u.id);
  const api = a.createToken(u.id, 'x');
  assert.strictEqual(a.tokenUser(api).id, u.id);
  const saved = fs.readFileSync(path.join(dir, 'users.json'), 'utf8');
  assert.ok(!saved.includes('long-enough') && !saved.includes(api), 'no secrets in clear text');
});

test('team: MCP comment names stay isolated between tokens of one user', async () => {
  const token = async (name) => {
    const r = await req('POST', '/api/me/tokens', { body: { name }, headers: as(admin) });
    assert.strictEqual(r.status, 200);
    return r.json.token;
  };
  const a = await token('Agent A'), b = await token('Agent B');
  assert.notStrictEqual(a, b);
  const mcp = (tok, method, params) => req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method, params }, headers: { Authorization: `Bearer ${tok}` } });
  const init = (tok, name) => mcp(tok, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name, version: '1' } });
  const call = (tok, name, args) => mcp(tok, 'tools/call', { name, arguments: args });
  const comment = async (tok, text) => {
    const r = await call(tok, 'add_comment', { board: 'attribution', text });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.result && !r.json.result.isError);
  };
  const board = { id: 'attribution', title: 'Attribution', doc: { rootId: 'r', settings: {}, nodes: { r: { id: 'r', parentId: null, order: 1, lines: ['Root'] } }, items: {} } };
  assert.strictEqual((await req('PUT', '/api/boards/attribution', { body: { board, baseRev: null }, headers: as(admin) })).status, 200);
  assert.strictEqual((await init(a, 'claude-code')).status, 200);
  await comment(a, 'A before B initializes');
  assert.strictEqual((await init(b, 'codex-mcp-client')).status, 200);
  await comment(a, 'A after B initializes');
  await comment(b, 'B actual comment');
  const saved = (await req('GET', '/api/boards/attribution', { headers: { Cookie: admin } })).json;
  const comments = Object.values(saved.doc.comments);
  assert.strictEqual(comments.length, 3);
  assert.strictEqual(comments.find((c) => c.text === 'A before B initializes').author.name, 'Claude Code (Ana)');
  assert.strictEqual(comments.find((c) => c.text === 'A after B initializes').author.name, 'Claude Code (Ana)');
  assert.strictEqual(comments.find((c) => c.text === 'B actual comment').author.name, 'Codex (Ana)');
  // Revocar A sigue bloqueando sus peticiones, sin quitarle el acceso a B.
  const mine = (await req('GET', '/api/me/tokens', { headers: { Cookie: admin } })).json.tokens;
  assert.strictEqual((await req('DELETE', `/api/me/tokens/${mine.find((t) => t.name === 'Agent A').id}`, { headers: as(admin) })).status, 200);
  assert.strictEqual((await call(a, 'add_comment', { board: 'attribution', text: 'MUST NOT EXIST' })).status, 401);
  const live = await call(b, 'list_boards', {});
  assert.strictEqual(live.status, 200);
  assert.ok(live.json.result && !live.json.result.isError);
  const afterRevocation = (await req('GET', '/api/boards/attribution', { headers: { Cookie: admin } })).json;
  assert.ok(!Object.values(afterRevocation.doc.comments).some((c) => c.text === 'MUST NOT EXIST'));
});
