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

// ¿Ocupa el puerto un Mapache de antes de la versión 0.4 (sin /api)? Sirve su sw.js pero no /api/info.
async function oldMapache(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/sw.js`, { signal: AbortSignal.timeout(800) });
    return r.ok && /mapache-v\d+/.test(await r.text());
  } catch { return false; }
}

// Arranca server.js desacoplado (sigue vivo al cerrar la terminal y no abre ventana en Windows).
async function start({ port = defaultPort(), store = Store.open() } = {}) {
  const already = await running(store);
  if (already) return { ...already, started: false };
  if (await oldMapache(port)) {
    throw new Error(`An older version of Mapache is still running on port ${port}. Close it first: on Windows, close the ` +
      `"Mapache (servidor)" window in the taskbar (or restart the computer); elsewhere, stop the old "node server.js". Then try again.`);
  }
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
  // Solo se para el proceso que dice ser Mapache en su /api/info (nunca un pid que se haya quedado viejo). En modo
  // equipo /api/info no dice el pid: se usa el de server.json, que escribe ese mismo servidor al arrancar.
  const s = readServerFile(store);
  const pid = info.pid || (s && s.port === info.port ? s.pid : null) || (s && !info.port ? s.pid : null);
  if (!pid) return false;
  try { process.kill(pid); } catch { return false; }
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
