// Avisos de versión nueva (lib/update.js): comparación de versiones, una consulta al día y nada si está desactivado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const U = require('../lib/update');

test('update: compara versiones', () => {
  assert.ok(U.newer('0.6.0', '0.5.4'));
  assert.ok(U.newer('v0.6.1', '0.6.0'));
  assert.ok(U.newer('1.0.0', '0.99.9'));
  assert.ok(U.newer('0.10.0', '0.9.0'), 'números, no texto');
  assert.ok(!U.newer('0.5.4', '0.5.4'));
  assert.ok(!U.newer('0.5.3', '0.5.4'));
  assert.ok(!U.newer('0.6.0-beta', '0.6.0'), 'los sufijos no cuentan como más nuevos');
  assert.ok(!U.newer('', '0.5.4'));
});

test('update: pregunta a GitHub una vez al día y recuerda la respuesta', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapache-update-'));
  let calls = 0, t = 1_000_000;
  const fetchImpl = async (url, opts) => {
    calls++;
    assert.match(url, /api\.github\.com\/repos\/Hackeatutiempo\/mapache\/releases\/latest/);
    assert.match(opts.headers['User-Agent'], /^Mapache\/0\.5\.4$/);
    return { ok: true, json: async () => ({ tag_name: 'v0.6.0', html_url: 'https://github.com/Hackeatutiempo/mapache/releases/tag/v0.6.0', body: 'News' }) };
  };
  const c = U.createChecker({ dir, current: '0.5.4', fetchImpl, now: () => t, disabled: false });
  const s = await c.check();
  assert.strictEqual(s.available, true);
  assert.strictEqual(s.latest, '0.6.0');
  assert.strictEqual(s.notes, 'News');
  await c.check();
  t += U.DAY - 1;
  await c.check();
  assert.strictEqual(calls, 1, 'no vuelve a preguntar antes de un día');
  t += 2;
  await c.check();
  assert.strictEqual(calls, 2);
  // Se guarda en la carpeta de datos (para `mapache status`) y otra instancia lo lee sin preguntar.
  assert.strictEqual(U.readCache(dir).latest, '0.6.0');
  const again = U.createChecker({ dir, current: '0.6.0', fetchImpl, now: () => t, disabled: false });
  assert.strictEqual(again.status().available, false, 'con la misma versión no hay aviso');
  assert.strictEqual(calls, 2);
});

test('update: si GitHub falla conserva lo que sabía; desactivado no pregunta nunca', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapache-update-'));
  let t = 0, up = true, calls = 0;
  const fetchImpl = async () => { calls++; if (!up) throw new Error('offline'); return { ok: true, json: async () => ({ tag_name: 'v0.7.0' }) }; };
  const c = U.createChecker({ dir, current: '0.6.0', fetchImpl, now: () => t, disabled: false });
  await c.check();
  up = false; t += U.DAY + 1;
  const s = await c.check();
  assert.strictEqual(s.latest, '0.7.0');
  assert.strictEqual(s.available, true);
  const off = U.createChecker({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'mapache-update-')), current: '0.6.0', fetchImpl, disabled: true });
  const before = calls;
  const o = await off.check({ force: true });
  assert.strictEqual(calls, before);
  assert.strictEqual(o.disabled, true);
  assert.strictEqual(o.available, false);
  assert.ok(U.disabledByEnv({ MAPACHE_UPDATE_CHECK: 'off' }));
  assert.ok(U.disabledByEnv({ CI: 'true' }));
  assert.ok(!U.disabledByEnv({}));
});
