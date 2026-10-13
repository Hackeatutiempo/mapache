// Servidor local mínimo para Mapache (sin dependencias). Uso: node server.js
// SPDX-License-Identifier: AGPL-3.0-or-later
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4321;
const REPO = 'Hackeatutiempo/mapache';

// La primera vez que se arranca en una terminal, pregunta si quieres dar una estrella al proyecto en GitHub.
// Solo se da si respondes que sí, y con tu propia sesión del CLI de GitHub (gh); nunca sin preguntar.
// No pregunta sin terminal (Docker, CI), con --no-star, ni una vez que ya has respondido.
const ASKED = path.join(__dirname, '.mapache-star-asked');
function askStar() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || process.argv.includes('--no-star') || fs.existsSync(ASKED)) return;
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`\n¿Te gusta Mapache? ¿Le das una estrella en GitHub (${REPO})? [s/N] `, (answer) => {
    rl.close();
    try { fs.writeFileSync(ASKED, new Date().toISOString()); } catch { /* sin permisos: se volverá a preguntar */ }
    if (!/^(s|si|sí|y|yes)$/i.test(answer.trim())) return console.log('Vale. ¡Gracias por usar Mapache!');
    require('child_process').execFile('gh', ['api', '-X', 'PUT', `/user/starred/${REPO}`], (err) => {
      if (err) console.log(`No se pudo con el CLI de GitHub (gh). Puedes darla aquí: https://github.com/${REPO}`);
      else console.log('¡Gracias por la estrella!');
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
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => { console.log(`Mapache en http://localhost:${PORT}`); askStar(); })
  .on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.log(`Ya estaba abierto en http://localhost:${PORT}`);
    else throw e;
  });
