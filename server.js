// Servidor local de Mapache (sin dependencias). Uso: node server.js  (o npm start)
// Sirve la app, guarda los tableros como archivos (ver lib/store.js), avisa al navegador en directo cuando cambian
// (también si los cambia tu agente de IA) y ofrece el MCP por HTTP en /mcp. Solo escucha en este ordenador.
// SPDX-License-Identifier: AGPL-3.0-or-later
const http = require('http');
const fs = require('fs');
const path = require('path');
const Store = require('./lib/store');
const MCP = require('./lib/mcp');
const Launch = require('./lib/launch');
const { version } = require('./package.json');

const PORT = Number(process.env.PORT) || 4321;
const REPO = 'Hackeatutiempo/mapache';
const ES = /^es/i.test(Intl.DateTimeFormat().resolvedOptions().locale || '');
const say = (es, en) => (ES ? es : en);

// La primera vez que se arranca en una terminal, pregunta si quieres dar una estrella al proyecto en GitHub.
// Solo se da si respondes que sí, y con tu propia sesión del CLI de GitHub (gh); nunca sin preguntar.
// No pregunta sin terminal (Docker, CI, en segundo plano), con --no-star, ni una vez que ya has respondido.
const ASKED = path.join(__dirname, '.mapache-star-asked');
function askStar() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || process.argv.includes('--no-star') || fs.existsSync(ASKED)) return;
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

// ---------- Avisos en directo (Server-Sent Events) ----------

const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

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

// ---------- Seguridad: solo este ordenador y solo la propia app ----------

// Evita que una web cualquiera lea o cambie tus tableros: el Host debe ser localhost (frena el «DNS rebinding»)
// y, si el navegador manda Origin, debe ser esta misma dirección.
const LOCAL_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
function allowed(req) {
  if (!LOCAL_HOSTS.has(String(req.headers.host || '').toLowerCase())) return false;
  const origin = req.headers.origin;
  if (origin && !LOCAL_HOSTS.has(origin.toLowerCase().replace(/^http:\/\//, ''))) return false;
  return true;
}

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

// ---------- API para la app ----------

const sessionFile = path.join(store.dir, 'session.json');

async function api(req, res, url) {
  const parts = url.split('/').filter(Boolean).slice(1); // sin 'api'
  const [kind, id] = parts;
  const m = req.method;
  if (kind === 'info' && m === 'GET') {
    return send(res, 200, { app: 'mapache', version, dataDir: store.dir, pid: process.pid, port: PORT, appDir: __dirname, node: process.execPath, bin: path.join(__dirname, 'bin', 'mapache.js') });
  }
  if (kind === 'events' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ version, dataDir: store.dir })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
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
  // La app dice qué tablero tiene abierto: así «el tablero que estoy viendo» funciona para el agente.
  if (kind === 'session' && m === 'PUT') {
    const s = await readJSON(req);
    Store.writeAtomic(sessionFile, JSON.stringify({ openBoard: s && typeof s.openBoard === 'string' ? s.openBoard : null, at: Date.now() }));
    return send(res, 200, { ok: true });
  }
  // Abrir un tablero en la pestaña de Mapache que ya está abierta (lo pide open_board).
  if (kind === 'open' && m === 'POST') {
    const s = await readJSON(req);
    if (clients.size && s && s.id) broadcast('show', { id: String(s.id) });
    return send(res, 200, { clients: clients.size });
  }
  return send(res, 404, { error: 'Not found' });
}

// ---------- MCP por HTTP (Streamable HTTP, sin estado) ----------

const mcp = MCP.makeServer({ store, open: (id, launch) => openFromHere(id, launch) });
async function openFromHere(id, launch) {
  const url = `http://localhost:${PORT}/#m=${encodeURIComponent(id)}`;
  if (launch && clients.size) broadcast('show', { id });
  else if (launch) await Launch.openURL(url);
  return url;
}
async function mcpHTTP(req, res) {
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
  const msg = await readJSON(req);
  const out = await mcp.handle(msg);
  if (!out) { res.writeHead(202); return res.end(); }
  return send(res, 200, out);
}

// ---------- Servidor ----------

const server = http.createServer(async (req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  try {
    if (url === '/api' || url.startsWith('/api/') || url === '/mcp') {
      if (!allowed(req)) return send(res, 403, { error: 'Forbidden' });
      return url === '/mcp' ? await mcpHTTP(req, res) : await api(req, res, url);
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
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  Store.writeAtomic(path.join(store.dir, 'server.json'), JSON.stringify({ pid: process.pid, port: PORT, version, startedAt: Date.now() }));
  watch();
  console.log(say(`Mapache en http://localhost:${PORT}`, `Mapache is running at http://localhost:${PORT}`));
  console.log(say(`Tus tableros: ${store.dir}`, `Your boards: ${store.dir}`));
  askStar();
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
