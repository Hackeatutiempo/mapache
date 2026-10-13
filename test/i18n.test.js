const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// Carga el diccionario y MMI18n con un window falso (sin DOM): idioma guardado e idioma del navegador.
function load(saved = null, navLang = 'en-US') {
  const store = new Map(saved ? [['mindmap:lang', saved]] : []);
  const ctx = {
    navigator: { languages: [navLang], language: navLang },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    location: { reload() { ctx.reloaded = true; } },
    store,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['i18n-en.js', 'i18n.js']) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

const EN = load().MMI18nEN;
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// Claves literales t('…'), t("…") y t(`…`) de todos los scripts de la app.
function literalKeys() {
  const out = [];
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.js') && !x.startsWith('i18n'))) {
    const src = read(f);
    const re = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
    for (const m of src.matchAll(re)) out.push([f, (m[1] ?? m[2] ?? m[3]).replace(/\\(['"`\\])/g, '$1')]);
  }
  return out;
}

// Textos y atributos estáticos de index.html (los que traduce MMI18n.apply).
function htmlStrings() {
  const html = read('index.html').replace(/<head>[\s\S]*<\/head>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const out = [];
  for (const m of html.matchAll(/>([^<]+)</g)) out.push(m[1].trim());
  for (const m of html.matchAll(/\s(?:title|placeholder|aria-label|alt|data-tip)="([^"]*)"/g)) out.push(m[1].trim());
  return [...new Set(out.filter(Boolean))];
}
// Nombres propios, marcas y combinaciones de teclas: iguales en los dos idiomas.
const NEUTRAL = new Set(['Mapache', 'Cristian', 'Hackea Tu Tiempo', 'Web', 'Instagram', 'hackeatutiempo.com', '@hackeatutiempo',
  'github.com/Hackeatutiempo/mapache', '(AGPL-3.0)', 'Zoom', '100%']);
const isKeys = (s) => !/[A-Za-zÁÉÍÓÚáéíóúñ]{2,}/.test(s.replace(/\b(Ctrl|Shift|Alt|Enter|Tab|Esc)\b/g, ''));

test('todas las claves t(…) del código tienen traducción al inglés', () => {
  const keys = literalKeys();
  assert.ok(keys.length > 300, `solo se encontraron ${keys.length} claves`);
  const missing = keys.filter(([, k]) => !Object.prototype.hasOwnProperty.call(EN, k)).map(([f, k]) => `${f}: ${k}`);
  assert.deepStrictEqual([...new Set(missing)], []);
});

test('los {marcadores} de cada clave están también en su traducción (y no hay otros)', () => {
  const bad = [];
  for (const [k, v] of Object.entries(EN)) {
    if (typeof v !== 'string' || !v.trim()) { bad.push(`vacía: ${k}`); continue; }
    if (placeholders(k).join() !== placeholders(v).join()) bad.push(`${k} → ${v}`);
  }
  assert.deepStrictEqual(bad, []);
});

test('el diccionario no repite claves', () => {
  const keys = [...read('i18n-en.js').matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepStrictEqual(dup, []);
  assert.strictEqual(keys.length, Object.keys(EN).length);
});

test('los textos estáticos de index.html tienen traducción', () => {
  const missing = htmlStrings().filter((s) => !NEUTRAL.has(s) && !isKeys(s) && !Object.prototype.hasOwnProperty.call(EN, s));
  assert.deepStrictEqual(missing, []);
});

test('las claves que se traducen al mostrarlas (colores del texto, palabras de los iconos) tienen traducción', () => {
  const app = read('app.js');
  const fmt = [...app.matchAll(/const FMT_(?:COLORS|HILITES) = \{([\s\S]*?)\};/g)].flatMap((m) => [...m[1].matchAll(/(\w+):/g)].map((x) => x[1]));
  assert.ok(fmt.includes('amarillo'));
  const words = [...read('icons.js').matchAll(/\['[^']+', '([^']+)'\]/g)].map((m) => m[1]);
  assert.ok(words.length > 100, `solo ${words.length} palabras clave`);
  const missing = [...fmt, ...words].filter((k) => !Object.prototype.hasOwnProperty.call(EN, k));
  assert.deepStrictEqual([...new Set(missing)], []);
});

test('t(): español por defecto en español, inglés en inglés, marcadores y clave como respaldo', () => {
  const es = load('es').MMI18n, en = load('en').MMI18n;
  assert.strictEqual(es.lang, 'es');
  assert.strictEqual(es.t('Guardado'), 'Guardado');
  assert.strictEqual(en.t('Guardado'), 'Saved');
  assert.strictEqual(es.t('Sección {n}', { n: 3 }), 'Sección 3');
  assert.strictEqual(en.t('Sección {n}', { n: 3 }), 'Section 3');
  assert.strictEqual(en.t('Texto que no está {x}', { x: 1 }), 'Texto que no está 1');
  assert.strictEqual(en.t('{a} y {b}', { a: 1 }), '1 y {b}'); // un marcador sin valor se queda como está
  assert.strictEqual(en.locale, 'en-US');
  assert.strictEqual(es.locale, 'es-ES');
});

test('idioma automático: español si el navegador empieza por es, si no inglés', () => {
  assert.strictEqual(load(null, 'es-ES').MMI18n.lang, 'es');
  assert.strictEqual(load(null, 'es').MMI18n.lang, 'es');
  assert.strictEqual(load(null, 'en-GB').MMI18n.lang, 'en');
  assert.strictEqual(load(null, 'fr-FR').MMI18n.lang, 'en');
  assert.strictEqual(load('auto', 'es-MX').MMI18n.pref, 'auto');
  assert.strictEqual(load('en', 'es-ES').MMI18n.lang, 'en');
  assert.strictEqual(load('es', 'en-US').MMI18n.lang, 'es');
  assert.strictEqual(load('xx', 'en-US').MMI18n.pref, 'auto');
});

test('setLang guarda la preferencia y recarga', () => {
  const ctx = load(null, 'es-ES');
  ctx.MMI18n.setLang('en');
  assert.strictEqual(ctx.store.get('mindmap:lang'), 'en');
  assert.ok(ctx.reloaded);
  ctx.MMI18n.setLang('cualquiera');
  assert.strictEqual(ctx.store.get('mindmap:lang'), 'auto');
});
