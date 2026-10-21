// Avisos de versión nueva. Una vez al día el servidor pregunta a GitHub cuál es la última versión publicada de
// Mapache (https://api.github.com/repos/Hackeatutiempo/mapache/releases/latest) y la app lo muestra si hay una
// más moderna. No se envía nada tuyo: es una consulta anónima, como abrir la página de releases. Se desactiva con
// MAPACHE_UPDATE_CHECK=off (y no se hace en CI). El resultado se guarda en <datos>/update.json.
// SPDX-License-Identifier: AGPL-3.0-or-later
const fs = require('fs');
const path = require('path');

const REPO = 'Hackeatutiempo/mapache';
const RELEASES = `https://github.com/${REPO}/releases/latest`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const DAY = 24 * 60 * 60 * 1000;
const FILE = 'update.json';

const disabledByEnv = (env = process.env) => /^(0|off|false|no)$/i.test(String(env.MAPACHE_UPDATE_CHECK || '').trim()) || !!env.CI;

// ¿Es `a` una versión posterior a `b`? ("0.6.1" > "0.6.0"; se ignoran una "v" delante y los sufijos tipo "-beta").
function newer(a, b) {
  const parts = (v) => String(v || '').trim().replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

function readCache(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8')); } catch { return null; }
}

function createChecker({ dir, current, fetchImpl = globalThis.fetch, now = Date.now, disabled = disabledByEnv() }) {
  let cache = readCache(dir);
  let inflight = null;

  function save() {
    try {
      const tmp = path.join(dir, `${FILE}.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(cache, null, 1));
      fs.renameSync(tmp, path.join(dir, FILE));
    } catch { /* sin permiso de escritura: se recuerda solo en memoria */ }
  }

  // Pregunta a GitHub si hace más de un día de la última vez (o si `force`). Si falla, conserva lo que sabía y
  // lo vuelve a intentar al día siguiente.
  function check({ force = false } = {}) {
    if (disabled || typeof fetchImpl !== 'function') return Promise.resolve(status());
    if (!force && cache && now() - (cache.checkedAt || 0) < DAY) return Promise.resolve(status());
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const res = await fetchImpl(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Mapache/${current}` }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const r = await res.json();
        const latest = String(r.tag_name || '').replace(/^v/i, '');
        if (!/^\d+\.\d+/.test(latest)) throw new Error('No version in the latest release');
        cache = { checkedAt: now(), latest, url: String(r.html_url || RELEASES), notes: String(r.body || '').slice(0, 4000), publishedAt: r.published_at || null };
      } catch (err) {
        cache = { ...(cache || {}), checkedAt: now(), error: String(err && err.message || err).slice(0, 200) };
      }
      save();
      return status();
    })().finally(() => { inflight = null; });
    return inflight;
  }

  function status() {
    const c = cache || {};
    return {
      current, latest: c.latest || null, available: !!(c.latest && newer(c.latest, current)),
      url: c.url || RELEASES, notes: c.notes || '', checkedAt: c.checkedAt || null, disabled: !!disabled,
    };
  }

  return { check, status };
}

module.exports = { createChecker, newer, readCache, disabledByEnv, RELEASES, DAY };
