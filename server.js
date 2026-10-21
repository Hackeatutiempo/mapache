// Servidor de Mapache (sin dependencias). Uso: node server.js  (o npm start)
// Sirve la app, guarda los tableros como archivos (ver lib/store.js), avisa al navegador en directo cuando cambian
// (también si los cambia tu agente de IA) y ofrece el MCP por HTTP en /mcp.
// - Modo local (por defecto): solo escucha en este ordenador, sin cuentas.
// - Modo equipo (MAPACHE_MODE=team): cuentas con email y contraseña, invitaciones, roles, presencia y cursores en
//   directo. Pensado para Docker o un servidor propio (ver TEAM.md).
// SPDX-License-Identifier: AGPL-3.0-or-later
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Store = require('./lib/store');
const MCP = require('./lib/mcp');
const Launch = require('./lib/launch');
const { version } = require('./package.json');

const PORT = Number(process.env.PORT) || 4321;
const TEAM = process.env.MAPACHE_MODE === 'team' || process.argv.includes('--team');
const HOST = process.env.HOST || (TEAM ? '0.0.0.0' : '127.0.0.1');
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
const REPO = 'Hackeatutiempo/mapache';
const ES = /^es/i.test(Intl.DateTimeFormat().resolvedOptions().locale || '');
const say = (es, en) => (ES ? es : en);

// Sin cuentas, los tableros solo pueden estar al alcance de este ordenador.
if (!TEAM && !/^(127\.0\.0\.1|localhost|::1)$/.test(HOST)) {
  console.error(say('En modo local Mapache solo escucha en este ordenador. Para usarlo en red, arráncalo en modo equipo (MAPACHE_MODE=team): ver TEAM.md.',
    'In local mode Mapache only listens on this computer. To use it over a network, start it in team mode (MAPACHE_MODE=team): see TEAM.md.'));
  process.exit(1);
}

// La primera vez que se arranca en una terminal, pregunta si quieres dar una estrella al proyecto en GitHub.
// Solo se da si respondes que sí, y con tu propia sesión del CLI de GitHub (gh); nunca sin preguntar.
// No pregunta sin terminal (Docker, CI, en segundo plano), con --no-star, ni una vez que ya has respondido.
const ASKED = path.join(__dirname, '.mapache-star-asked');
function askStar() {
  if (TEAM || !process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || process.argv.includes('--no-star') || fs.existsSync(ASKED)) return;
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  rl.question(say(`\n¿Te gusta Mapache? ¿Le das una estrella en GitHub (${REPO})? [s/N] `, `\nEnjoying Mapache? Star it on GitHub (${REPO})? [y/N] `), (answer) => {
    rl.close();
    try { fs.writeFileSync(ASKED, new Date().toISOString()); } catch { /* sin permisos: se volverá a preguntar */ }
    if (!/^(s|si|sí|y|yes)$/i.test(answer.trim())) return console.log(say('Vale. ¡Gracias por usar Mapache!', 'OK. Thanks for using Mapache!'));
    require('child_process').execFile('gh', ['api', '-X', 'PUT', `/user/starred/${REPO}`], (err) => {
      if (err) console.log(say(`No se pudo con el CLI de GitHub (gh). Puedes darla aquí: https://github.com/${REPO}`, `The GitHub CLI (gh) could not do it. You can star it here: https://github.com/${REPO}`));
      else console.log(say('¡Gracias por la estrella!', 'Thanks for the star!'));
    });
  });
}

const ROOT = path.join(__dirname, 'src');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const store = Store.open();
// Versión nueva publicada en GitHub (una consulta al día, sin datos tuyos; MAPACHE_UPDATE_CHECK=off la desactiva).
const updates = require('./lib/update').createChecker({ dir: store.dir, current: version });
// En modo equipo solo se lo cuenta a quien administra el servidor, que es quien puede actualizarlo.
function updateInfo(user) {
  const s = updates.status();
  if (TEAM && !(user && user.role === 'admin')) return { current: version, available: false };
  return { ...s, how: TEAM ? 'git pull && docker compose up -d --build' : `node "${path.join(__dirname, 'bin', 'mapache.js')}" update` };
}

// ---------- Avisos en directo (Server-Sent Events), presencia y cursores ----------

// Cada pestaña conectada: { cid, user, board }.
const clients = new Map();
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function broadcast(event, data, filter = null) {
  const msg = sse(event, data);
  for (const [res, c] of clients) if (!filter || filter(c)) res.write(msg);
}
setInterval(() => { for (const res of clients.keys()) res.write(': ping\n\n'); }, 25000).unref();

// Quién está conectado y en qué tablero (solo en modo equipo).
let presenceTimer = null;
function presence() {
  if (!TEAM) return;
  clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => {
    const people = [...clients.values()].filter((c) => c.user).map((c) => ({ cid: c.cid, id: c.user.id, name: c.user.name, color: c.user.color, board: c.board }));
    broadcast('presence', { people });
  }, 60);
}

// Vigila la carpeta: cualquier cambio en un tablero (de la app, de la línea de comandos o del MCP) se avisa.
const known = new Map(store.listBoards().map((b) => [b.id, b.rev || 0]));
let foldersRev = store.readFolders().rev;
const pending = new Map();
function checkBoard(id) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return;
  let rev = null;
  try { rev = store.boardRev(id); } catch { return; }
  if (rev === null) { if (known.has(id)) { known.delete(id); broadcast('board', { id, deleted: true }); } return; }
  if (known.get(id) !== rev) { known.set(id, rev); broadcast('board', { id, rev }); }
}
function checkFolders() {
  let rev;
  try { rev = store.readFolders().rev; } catch { return; }
  if (rev !== foldersRev) { foldersRev = rev; broadcast('folders', { rev }); }
}
const soon = (key, fn) => { clearTimeout(pending.get(key)); pending.set(key, setTimeout(() => { pending.delete(key); fn(); }, 40)); };
function watch() {
  try {
    fs.watch(store.dirs.boards, (ev, file) => {
      if (!file) return rescan();
      const m = String(file).match(/^(.+)\.json$/);
      if (m) soon(`b:${m[1]}`, () => checkBoard(m[1]));
    });
    fs.watch(store.dir, (ev, file) => { if (!file || String(file) === 'folders.json') soon('folders', checkFolders); });
  } catch { /* sin fs.watch: queda la revisión periódica */ }
  // Red de seguridad por si el sistema no avisa de algún cambio.
  setInterval(rescan, 4000).unref();
}
function rescan() {
  const now = new Set();
  for (const b of store.listBoards()) { now.add(b.id); if (known.get(b.id) !== (b.rev || 0)) checkBoard(b.id); }
  for (const id of [...known.keys()]) if (!now.has(id)) checkBoard(id);
  checkFolders();
}

// ---------- Utilidades HTTP ----------

function readBody(req, limit = 600 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJSON = async (req) => {
  if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('Expected JSON'), { status: 415 });
  try { return JSON.parse((await readBody(req, 200 * 1024 * 1024)).toString('utf8') || 'null'); } catch (e) { throw Object.assign(new Error('Invalid JSON'), { status: e.status || 400 }); }
};
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data === undefined ? '' : JSON.stringify(data));
}

// Dirección pública con la que el navegador ve este servidor (para enlaces de invitación y comprobar el Origin).
const secure = (req) => (PUBLIC_URL ? PUBLIC_URL.startsWith('https:') : TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
function origin(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host || `localhost:${PORT}`;
  return `${secure(req) ? 'https' : 'http'}://${String(host).split(',')[0].trim()}`;
}

// ---------- Seguridad ----------

// Modo local: el Host debe ser localhost (frena el «DNS rebinding») y, si el navegador manda Origin, debe ser esta
// misma dirección. Así ninguna web que visites puede leer ni cambiar tus tableros.
const LOCAL_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
function allowedLocal(req) {
  if (!LOCAL_HOSTS.has(String(req.headers.host || '').toLowerCase())) return false;
  const o = req.headers.origin;
  if (o && !LOCAL_HOSTS.has(o.toLowerCase().replace(/^http:\/\//, ''))) return false;
  return true;
}
// Modo equipo: los cambios hechos con la cookie de sesión deben venir de la propia app (contra CSRF).
// Vale la dirección pública y también aquella con la que se ha entrado (por ejemplo, localhost en el propio servidor).
function sameOrigin(req) {
  const o = String(req.headers.origin || '').toLowerCase();
  if (!o) return req.method === 'GET' || req.method === 'HEAD';
  const host = String(req.headers.host || '').toLowerCase();
  return o === origin(req).toLowerCase() || o === `http://${host}` || o === `https://${host}`;
}
// Dirección para compartir (enlaces de invitación): la pública; si se entró por localhost, la IP en la red local.
function shareOrigin(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const o = origin(req);
  const lan = Store.lanAddress();
  return lan && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(o) ? `http://${lan}:${PORT}` : o;
}

let team = null;
let auth = null;
if (TEAM) {
  auth = require('./lib/auth').open(store.dir);
  team = require('./lib/team').makeTeam({ auth, send, readJSON, origin: shareOrigin, secure, onTeamChange: () => broadcast('team', { at: Date.now() }), onSignOut: signOut });
  // Primera cuenta sin pasar por la web (útil en Docker): MAPACHE_ADMIN_EMAIL y MAPACHE_ADMIN_PASSWORD.
  if (auth.needsSetup() && process.env.MAPACHE_ADMIN_EMAIL && process.env.MAPACHE_ADMIN_PASSWORD) {
    try { auth.createUser({ email: process.env.MAPACHE_ADMIN_EMAIL, name: process.env.MAPACHE_ADMIN_NAME, password: process.env.MAPACHE_ADMIN_PASSWORD, role: 'admin' }); } catch (e) { console.error(e.message); }
  }
}
const canWrite = (user) => !TEAM || (user && user.role !== 'viewer');

// Sin sesión válida (rol cambiado, cuenta quitada, contraseña nueva o cierre de sesión): se cierran sus pestañas en
// directo para que vuelvan a la pantalla de acceso en el momento.
function signOut(userId) {
  for (const [res, c] of clients) {
    if (c.user && c.user.id === userId) { res.write(sse('signout', {})); res.end(); clients.delete(res); }
  }
  presence();
}

// ---------- API para la app ----------

const sessionFile = path.join(store.dir, 'session.json');
const readSession = () => { try { return JSON.parse(fs.readFileSync(sessionFile, 'utf8')); } catch { return {}; } };

// Exportar un tablero para tu agente: lo dibuja una pestaña de Mapache abierta (de esa persona, en modo equipo).
const exportsPending = new Map();
function exportFromApp(id, format, user) {
  const mine = [...clients].filter(([, c]) => !TEAM || (user && c.user && c.user.id === user.id));
  if (!mine.length) return Promise.resolve({ error: 'no-app' });
  const reqId = crypto.randomUUID();
  const [target] = mine[mine.length - 1];
  return new Promise((resolve) => {
    const timer = setTimeout(() => { exportsPending.delete(reqId); resolve({ error: 'The Mapache tab did not answer in time' }); }, 90000);
    exportsPending.set(reqId, (r) => { clearTimeout(timer); resolve(r); });
    target.write(sse('export', { reqId, id, format }));
  });
}
const mineFilter = (user) => (c) => !TEAM || (user && c.user && c.user.id === user.id);

async function api(req, res, url, user) {
  const parts = url.split('/').filter(Boolean).slice(1); // sin 'api'
  const [kind, id] = parts;
  const m = req.method;
  const write = m !== 'GET' && m !== 'HEAD';
  if (write && !canWrite(user) && !['session', 'cursor', 'me', 'export'].includes(kind)) return send(res, 403, { error: 'Your role can only view boards' });
  if (TEAM && team) { const done = await team.teamRoutes(req, res, parts, user); if (done) return; }
  if (kind === 'events' && m === 'GET') {
    const cid = crypto.randomUUID();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 2000\n${sse('hello', { version, cid, ...(TEAM ? {} : { dataDir: store.dir }) })}`);
    clients.set(res, { cid, user: TEAM ? user : null, board: null });
    presence();
    req.on('close', () => { clients.delete(res); presence(); });
    return;
  }
  if (kind === 'boards') {
    if (!id && m === 'GET') return send(res, 200, store.listBoards());
    if (id && m === 'GET') { const b = store.getBoard(id); return b ? send(res, 200, b) : send(res, 404, { error: 'Not found' }); }
    if (id && m === 'PUT') {
      const body = await readJSON(req);
      if (!body || !body.board || body.board.id !== id || !body.board.doc) return send(res, 400, { error: 'Expected { board, baseRev }' });
      try {
        const saved = store.putBoard(body.board, { baseRev: body.baseRev === undefined ? undefined : body.baseRev });
        known.set(id, saved.rev);
        broadcast('board', { id, rev: saved.rev });
        return send(res, 200, { rev: saved.rev });
      } catch (e) {
        if (e instanceof Store.Conflict) return send(res, 409, { board: e.current });
        throw e;
      }
    }
    if (id && m === 'DELETE') { store.removeBoard(id); known.delete(id); broadcast('board', { id, deleted: true }); return send(res, 200, { ok: true }); }
  }
  if (kind === 'folders') {
    if (!id && m === 'GET') return send(res, 200, store.readFolders());
    if (id && m === 'PUT') {
      const f = await readJSON(req);
      if (!f || f.id !== id) return send(res, 400, { error: 'Expected a folder' });
      foldersRev = store.putFolder(f).rev;
      broadcast('folders', { rev: foldersRev });
      return send(res, 200, { rev: foldersRev });
    }
    if (id && m === 'DELETE') { foldersRev = store.removeFolder(id).rev; broadcast('folders', { rev: foldersRev }); return send(res, 200, { rev: foldersRev }); }
  }
  if (kind === 'media' && id) {
    if (m === 'GET') {
      const md = store.getMedia(id);
      if (!md) return send(res, 404, { error: 'Not found' });
      // Solo tipos de vídeo, audio o imagen: nada que el navegador pudiera ejecutar como página.
      const type = /^(video|audio|image)\/[\w.+-]+$/i.test(md.type || '') && !/svg/i.test(md.type) ? md.type : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'X-Media-Name': encodeURIComponent(md.name || ''), 'Cache-Control': 'private, max-age=31536000, immutable' });
      return fs.createReadStream(md.file).pipe(res);
    }
    if (m === 'HEAD') { res.writeHead(store.hasMedia(id) ? 200 : 404); return res.end(); }
    if (m === 'PUT') {
      const buf = await readBody(req);
      store.putMedia(id, buf, { type: String(req.headers['content-type'] || 'application/octet-stream'), name: decodeURIComponent(String(req.headers['x-media-name'] || '')) });
      return send(res, 200, { ok: true });
    }
  }
  // La app dice qué tablero tiene abierto: así «el tablero que estoy viendo» funciona para el agente (de cada persona,
  // en modo equipo) y los demás ven en qué tablero estás.
  if (kind === 'session' && m === 'PUT') {
    const s = (await readJSON(req)) || {};
    const openBoard = typeof s.openBoard === 'string' ? s.openBoard : null;
    const prev = readSession();
    const byUser = { ...(prev.byUser || {}) };
    if (user) byUser[user.id] = { openBoard, at: Date.now() };
    Store.writeAtomic(sessionFile, JSON.stringify({ openBoard, at: Date.now(), byUser }));
    for (const c of clients.values()) if (c.cid === s.cid) { c.board = openBoard; presence(); }
    return send(res, 200, { ok: true });
  }
  // Cursores en directo: se reenvían a quien esté en el mismo tablero.
  if (kind === 'cursor' && m === 'POST') {
    const s = (await readJSON(req)) || {};
    const me = [...clients.values()].find((c) => c.cid === s.cid);
    if (TEAM && me && user && Number.isFinite(s.x) && Number.isFinite(s.y)) {
      me.board = typeof s.board === 'string' ? s.board : me.board;
      broadcast('cursor', { cid: me.cid, id: user.id, name: user.name, color: user.color, board: me.board, x: Math.round(s.x), y: Math.round(s.y) },
        (c) => c.cid !== me.cid && c.board === me.board);
    }
    return send(res, 200, { ok: true });
  }
  if (kind === 'export' && !id && m === 'POST') {
    const s = await readJSON(req);
    if (!s || typeof s.id !== 'string') return send(res, 400, { error: 'Expected { id, format }' });
    const r = await exportFromApp(s.id, String(s.format || 'html'), user);
    if (r.error) return send(res, r.error === 'no-app' ? 409 : 502, { error: r.error });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    return res.end(r.file);
  }
  if (kind === 'export' && id && m === 'PUT') {
    const done = exportsPending.get(id);
    const buf = await readBody(req, 400 * 1024 * 1024);
    if (!done) return send(res, 410, { error: 'Gone' });
    exportsPending.delete(id);
    const err = req.headers['x-export-error'];
    done(err ? { error: decodeURIComponent(String(err)) } : { file: buf });
    return send(res, 200, { ok: true });
  }
  // Abrir un tablero en la pestaña de Mapache que ya está abierta (lo pide open_board).
  if (kind === 'open' && m === 'POST') {
    const s = await readJSON(req);
    const n = [...clients.values()].filter(mineFilter(user)).length;
    if (n && s && s.id) broadcast('show', { id: String(s.id) }, mineFilter(user));
    return send(res, 200, { clients: n });
  }
  return send(res, 404, { error: 'Not found' });
}

function info(req, user) {
  const base = { app: 'mapache', version, mode: TEAM ? 'team' : 'local' };
  if (!TEAM) return { ...base, dataDir: store.dir, pid: process.pid, port: PORT, appDir: __dirname, node: process.execPath, bin: path.join(__dirname, 'bin', 'mapache.js') };
  const out = { ...base, user: user || null, needsSetup: auth.needsSetup(), url: origin(req) };
  if (user && user.role === 'admin') Object.assign(out, { dataDir: store.dir, port: PORT });
  return out;
}

// ---------- MCP por HTTP (Streamable HTTP, sin estado) ----------

async function exportHere(id, format, user) {
  for (let i = 0; i < 40; i++) {
    const r = await exportFromApp(id, format, user);
    if (r.file) return r.file;
    if (r.error !== 'no-app') throw new Error(r.error);
    if (TEAM) throw new Error('Open Mapache in your browser first: the app draws the export');
    if (i === 0) await Launch.openURL(`http://localhost:${PORT}/#m=${encodeURIComponent(id)}`);
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error('Mapache needs to be open in a browser to export. Open it and try again');
}
async function openFromHere(id, launch, user) {
  const url = `${TEAM ? PUBLIC_URL || `http://localhost:${PORT}` : `http://localhost:${PORT}`}/#m=${encodeURIComponent(id)}`;
  const mine = [...clients.values()].filter(mineFilter(user)).length;
  if (launch && mine) broadcast('show', { id }, mineFilter(user));
  else if (launch && !TEAM) await Launch.openURL(url);
  return url;
}
// Se recuerda el nombre declarado del cliente por credencial, para que dos agentes de una persona
// no sobrescriban sus firmas. El nombre declarado no autentica la identidad del agente.
const mcpClients = new Map();
async function mcpHTTP(req, res, user) {
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
  const msg = await readJSON(req);
  let key = user ? 'user:' + user.id : 'local';
  if (user && user.via === 'token') {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    key = 'token:' + crypto.createHash('sha256').update(token).digest('hex');
  }
  const ci = msg && msg.method === 'initialize' && msg.params && msg.params.clientInfo;
  if (ci && (ci.title || ci.name)) mcpClients.set(key, { name: String(ci.title || ci.name).slice(0, 80) });
  const server = MCP.makeServer({ store, user: TEAM ? user : null, client: mcpClients.get(key) || null, open: (id, launch) => openFromHere(id, launch, user), exportBoard: (id, format) => exportHere(id, format, user) });
  const out = await server.handle(msg);
  if (!out) { res.writeHead(202); return res.end(); }
  return send(res, 200, out);
}

// ---------- Servidor ----------

const server = http.createServer(async (req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  try {
    if (url === '/api' || url.startsWith('/api/') || url === '/mcp') {
      let user = null;
      if (!TEAM) {
        if (!allowedLocal(req)) return send(res, 403, { error: 'Forbidden' });
      } else {
        user = team.who(req);
        // Con cookie, los cambios tienen que venir de la propia app; con token (agentes) no hay navegador.
        const bearer = /^Bearer\s/i.test(String(req.headers.authorization || ''));
        if (!bearer && !sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
      }
      if (url === '/api/info' && req.method === 'GET') return send(res, 200, info(req, user));
      if (TEAM && url.startsWith('/api/auth/')) {
        if (await team.authRoutes(req, res, url.split('/').filter(Boolean).slice(1))) return;
        return send(res, 404, { error: 'Not found' });
      }
      if (TEAM && !user) {
        if (url === '/mcp') res.setHeader('WWW-Authenticate', 'Bearer realm="mapache"');
        return send(res, 401, { error: 'Log in first' });
      }
      if (url === '/api/update' && req.method === 'GET') return send(res, 200, updateInfo(user));
      return url === '/mcp' ? await mcpHTTP(req, res, user) : await api(req, res, url, user);
    }
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) return send(res, e.status || 500, { error: e.message });
    return res.end();
  }
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    if (TEAM) Object.assign(headers, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  Store.writeAtomic(path.join(store.dir, 'server.json'), JSON.stringify({ pid: process.pid, port: PORT, version, mode: TEAM ? 'team' : 'local', startedAt: Date.now() }));
  watch();
  if (TEAM) {
    console.log(say(`Mapache (modo equipo) en ${PUBLIC_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`}`, `Mapache (team mode) is running at ${PUBLIC_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`}`));
    if (team.setupCode()) console.log(say(`Código para crear la cuenta de admin: ${team.setupCode()}`, `Setup code to create the admin account: ${team.setupCode()}`));
    const lan = Store.lanAddress();
    if (lan && !PUBLIC_URL && HOST === '0.0.0.0') console.log(say(`En tu red: http://${lan}:${PORT}`, `On your network: http://${lan}:${PORT}`));
  } else console.log(say(`Mapache en http://localhost:${PORT}`, `Mapache is running at http://localhost:${PORT}`));
  console.log(say(`Tableros: ${store.dir}`, `Boards: ${store.dir}`));
  askStar();
  // La primera consulta, un poco después de arrancar; luego se repasa cada pocas horas (solo pregunta si pasó un día).
  const look = () => updates.check().then((s) => {
    if (s.available && !look.told) { look.told = true; console.log(say(`Hay una versión nueva de Mapache: ${s.latest} (tienes ${version}). ${s.url}`, `A new version of Mapache is available: ${s.latest} (you have ${version}). ${s.url}`)); }
  }).catch(() => {});
  setTimeout(look, 20 * 1000).unref();
  setInterval(look, 6 * 60 * 60 * 1000).unref();
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log(say(`Ya estaba abierto en http://localhost:${PORT}`, `Already running at http://localhost:${PORT}`)); process.exit(0); }
  throw e;
});

// Al cerrar, se borra server.json (si sigue siendo el nuestro).
function bye() {
  try {
    const f = path.join(store.dir, 'server.json');
    if (JSON.parse(fs.readFileSync(f, 'utf8')).pid === process.pid) fs.unlinkSync(f);
  } catch { /* ya no está */ }
  process.exit(0);
}
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
