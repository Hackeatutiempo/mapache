// Tableros en archivos de tu ordenador: una carpeta con un JSON por tablero, las carpetas y los vídeos.
// La usan el servidor (para el navegador), la línea de comandos y el MCP, así que cualquiera puede leer y cambiar
// los mismos tableros. Cada tablero lleva `rev`, que sube en cada guardado: así nadie pisa un cambio que no ha visto.
// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Carpeta de datos: MAPACHE_DATA o ~/.mapache.
const dataDir = () => path.resolve(process.env.MAPACHE_DATA || path.join(os.homedir(), '.mapache'));
const dirs = (root = dataDir()) => ({
  root,
  boards: path.join(root, 'boards'),
  media: path.join(root, 'media'),
  trash: path.join(root, 'trash'),
  folders: path.join(root, 'folders.json'),
});

function ensure(root = dataDir()) {
  const d = dirs(root);
  for (const p of [d.root, d.boards, d.media, d.trash]) fs.mkdirSync(p, { recursive: true });
  return d;
}

const ID = /^[A-Za-z0-9_-]{1,80}$/;
function checkId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw Object.assign(new Error(`Invalid id: ${id}`), { status: 400 });
  return id;
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

// Escritura atómica: primero a un temporal y luego se renombra (nunca queda un archivo a medias).
// En Windows el renombrado puede fallar un instante si otro proceso está leyendo el archivo: se reintenta.
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data);
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch { /* ya no está */ } throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}

class Conflict extends Error {
  constructor(current) { super('The board changed in the meantime'); this.status = 409; this.current = current; }
}

function open(root = dataDir()) {
  const d = ensure(root);
  const boardFile = (id) => path.join(d.boards, `${checkId(id)}.json`);

  // Índice: los datos de cada tablero sin el documento. Solo se vuelve a leer un archivo si cambió (fecha y tamaño),
  // porque un tablero con imágenes puede ocupar varios megas.
  const metaCache = new Map();
  function listBoards() {
    const out = [];
    const seen = new Set();
    for (const f of fs.readdirSync(d.boards)) {
      if (!f.endsWith('.json')) continue;
      const file = path.join(d.boards, f);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      seen.add(file);
      const hit = metaCache.get(file);
      if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) { out.push(hit.meta); continue; }
      let b = null;
      try { b = readJSON(file, null); } catch { continue; } // a medio escribir por otro programa: en la próxima vuelta
      if (!b || !b.id) continue;
      const { doc, ...meta } = b;
      metaCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, meta });
      out.push(meta);
    }
    for (const k of metaCache.keys()) if (!seen.has(k)) metaCache.delete(k);
    return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  const getBoard = (id) => readJSON(boardFile(id), null);
  const boardRev = (id) => { const b = getBoard(id); return b ? b.rev || 0 : null; };

  // Guarda si nadie lo cambió desde `baseRev`: un número = la versión que se vio; null = no debe existir aún;
  // undefined = sin comprobar. Devuelve el tablero guardado.
  function putBoard(board, { baseRev } = {}) {
    checkId(board.id);
    const cur = getBoard(board.id);
    if (cur && baseRev !== undefined && (cur.rev || 0) !== baseRev) throw new Conflict(cur);
    const now = Date.now();
    const out = { ...board, rev: (cur ? cur.rev || 0 : 0) + 1, createdAt: board.createdAt || (cur && cur.createdAt) || now, updatedAt: board.updatedAt || now };
    writeAtomic(boardFile(board.id), JSON.stringify(out));
    return out;
  }

  // Lee, cambia y guarda; si otro guardó entre medias, lo vuelve a intentar sobre la versión nueva.
  function updateBoard(id, fn) {
    for (let i = 0; i < 8; i++) {
      const cur = getBoard(id);
      if (!cur) throw Object.assign(new Error(`Board not found: ${id}`), { status: 404 });
      const next = JSON.parse(JSON.stringify(cur));
      const result = fn(next);
      next.updatedAt = Date.now();
      try { return { board: putBoard(next, { baseRev: cur.rev || 0 }), result }; } catch (e) { if (!(e instanceof Conflict)) throw e; }
    }
    throw new Error('The board is changing too fast, try again');
  }

  // Borrar no es definitivo: el tablero va a la papelera (trash/) y se puede recuperar.
  function removeBoard(id) {
    const file = boardFile(id);
    const b = readJSON(file, null);
    if (!b) return false;
    writeAtomic(path.join(d.trash, `${id}.json`), JSON.stringify({ ...b, deletedAt: Date.now() }));
    fs.unlinkSync(file);
    return true;
  }
  function listTrash() {
    return fs.readdirSync(d.trash).filter((f) => f.endsWith('.json')).map((f) => {
      const { doc, ...meta } = readJSON(path.join(d.trash, f), {});
      return meta;
    }).filter((m) => m.id).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  }
  function restoreBoard(id) {
    const file = path.join(d.trash, `${checkId(id)}.json`);
    const b = readJSON(file, null);
    if (!b) return null;
    delete b.deletedAt;
    const out = putBoard({ ...b, updatedAt: Date.now() });
    fs.unlinkSync(file);
    return out;
  }

  // Carpetas: un solo archivo { rev, folders: [...] }.
  const readFolders = () => {
    const f = readJSON(d.folders, null);
    return f && Array.isArray(f.folders) ? f : { rev: 0, folders: [] };
  };
  function writeFolders(fn) {
    const cur = readFolders();
    const folders = fn(cur.folders.slice());
    const out = { rev: cur.rev + 1, folders };
    writeAtomic(d.folders, JSON.stringify(out, null, 1));
    return out;
  }
  const putFolder = (f) => { checkId(f.id); return writeFolders((list) => [...list.filter((x) => x.id !== f.id), f]); };
  const removeFolder = (id) => writeFolders((list) => list.filter((x) => x.id !== id));

  // Vídeos subidos: el archivo tal cual y sus datos (tipo y nombre) al lado.
  const mediaFile = (id) => path.join(d.media, checkId(id));
  function getMedia(id) {
    const meta = readJSON(`${mediaFile(id)}.json`, null);
    if (!meta) return null;
    return { ...meta, file: mediaFile(id) };
  }
  function putMedia(id, buf, { type = 'application/octet-stream', name = '' } = {}) {
    writeAtomic(mediaFile(id), buf);
    writeAtomic(`${mediaFile(id)}.json`, JSON.stringify({ id, type, name, size: buf.length }));
  }
  const hasMedia = (id) => fs.existsSync(`${mediaFile(id)}.json`);

  return { dir: d.root, dirs: d, listBoards, getBoard, boardRev, putBoard, updateBoard, removeBoard, listTrash, restoreBoard,
    readFolders, putFolder, removeFolder, getMedia, putMedia, hasMedia };
}

module.exports = { open, dataDir, Conflict, checkId, writeAtomic };
