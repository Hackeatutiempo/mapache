// Arrancar Mapache en segundo plano (sin ventana) y abrirlo en el navegador. Lo usan la línea de comandos,
// los lanzadores (Abrir Mapache.cmd, start.sh) y la herramienta open_board del MCP.
// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const Store = require('./store');

const ROOT = path.join(__dirname, '..');
const defaultPort = () => Number(process.env.PORT) || 4321;

function readServerFile(store) {
  try { return JSON.parse(fs.readFileSync(path.join(store.dir, 'server.json'), 'utf8')); } catch { return null; }
}

// ¿Responde Mapache en ese puerto? Devuelve su /api/info o null.
async function ping(port, timeout = 800) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/info`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const info = await res.json();
    return info && info.app === 'mapache' ? info : null;
  } catch { return null; }
}

async function running(store = Store.open()) {
  const s = readServerFile(store);
  const ports = [...new Set([s && s.port, defaultPort()].filter(Boolean))];
  for (const p of ports) { const info = await ping(p); if (info) return info; }
  return null;
}

// Arranca server.js desacoplado (sigue vivo al cerrar la terminal y no abre ventana en Windows).
async function start({ port = defaultPort(), store = Store.open() } = {}) {
  const already = await running(store);
  if (already) return { ...already, started: false };
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--no-star'], {
    cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, PORT: String(port) },
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const info = await ping(port);
    if (info) return { ...info, started: true };
  }
  throw new Error(`Mapache did not start on port ${port}. Is the port taken? Try: PORT=4400 mapache start`);
}

async function stop(store = Store.open()) {
  const info = await running(store);
  if (!info) return false;
  // Solo se para el proceso que dice ser Mapache en su /api/info (nunca un pid que se haya quedado viejo).
  try { process.kill(info.pid); } catch { return false; }
  return true;
}

function openURL(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  return new Promise((resolve) => {
    const p = execFile(cmd[0], cmd[1], { windowsHide: true }, () => resolve());
    p.on('error', () => resolve());
  });
}

// Abre un tablero (o la app) y arranca el servidor si hace falta.
async function openBoard(id, launch = true, store = Store.open()) {
  const info = await start({ store });
  const url = `http://localhost:${info.port}/${id ? `#m=${encodeURIComponent(id)}` : ''}`;
  if (launch) await openURL(url);
  return url;
}

module.exports = { start, stop, running, ping, openURL, openBoard, defaultPort };
