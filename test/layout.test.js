const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/layout.js');

// Tamaños de referencia medidos.
const SIZES = { root: [90, 72], a: [88, 36], b: [87, 36], b1: [72, 24], b2: [72, 24], n: [299, 24] };
const size = (id) => { const [w, h] = SIZES[id] || [60, 24]; return { w, h }; };

function sample(settings = {}) {
  const node = (id, parentId, order, style = {}) => ({ id, parentId, order, style });
  return {
    rootId: 'root',
    settings: Object.assign({ layout: 'horizontal', lines: 'curvy' }, settings),
    nodes: {
      root: node('root', null, 1),
      a: node('a', 'root', 2, { color: 'purple' }),
      b: node('b', 'root', 3, { color: 'blue' }),
      b1: node('b1', 'b', 1),
      b2: node('b2', 'b', 2),
      n: node('n', 'b2', 1),
    },
  };
}

const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test('hueco de 96 px en todos los niveles y franjas de 72/48 px', () => {
  const { boxes: B } = L.computeLayout(sample(), size);
  assert.strictEqual(B.a.x - (B.root.x + B.root.w), 96);
  assert.strictEqual(B.b1.x - (B.b.x + B.b.w), 96);
  assert.strictEqual(B.n.x - (B.b2.x + B.b2.w), 96);
  // Rama A y B: centros a 72 px; hijos de nivel 2: a 48 px.
  assert.strictEqual((B.b.y + B.b.h / 2) - (B.a.y + B.a.h / 2) >= 72, true);
  assert.strictEqual((B.b2.y + 12) - (B.b1.y + 12), 48);
});

test('dos ramas sin hijos quedan a ±36 px del centro de la raíz (medido)', () => {
  const d = sample();
  delete d.nodes.b1; delete d.nodes.b2; delete d.nodes.n;
  const { boxes: B, connectors } = L.computeLayout(d, size);
  assert.strictEqual(B.a.y + 18, -36);
  assert.strictEqual(B.b.y + 18, 36);
  // Curva medida: "M-137.5,45c80,0 57.5,-27 137.5,-27" relativa a Rama A → arranque a −9 del centro.
  const [, sy] = nums(connectors.find((c) => c.id === 'a').d);
  assert.strictEqual(sy, -9);
});

test('curva de nivel 2+: tramos rectos de 10 px y controles a 40 px', () => {
  const d = sample();
  delete d.nodes.b1;
  const { boxes: B, connectors } = L.computeLayout(d, size);
  const p = nums(connectors.find((c) => c.id === 'b2').d);
  const sx = B.b.x + B.b.w;
  assert.deepStrictEqual(p.filter((_, i) => i % 2 === 0).map((x) => Math.round(x - sx)), [0, 10, 50, 46, 86, 96]);
});

test('angular: desde la raíz baja en vertical y sigue recto; en profundidad, codo a mitad', () => {
  const d = sample({ lines: 'angular' });
  delete d.nodes.b1; delete d.nodes.b2; delete d.nodes.n;
  d.nodes.b1 = { id: 'b1', parentId: 'b', order: 1, style: {} };
  const { boxes: B, connectors } = L.computeLayout(d, size);
  const a = connectors.find((c) => c.id === 'a').d;
  assert.match(a, /^M[-\d.]+,0L[-\d.]+,-36L141,-36$/);
  assert.ok(Math.abs(B.a.x - nums(a)[0] - 112.3) < 0.01);
  const deep = nums(connectors.find((c) => c.id === 'b1').d);
  assert.strictEqual(deep[2] - deep[0], 48);
});

test('rama a la izquierda y layout vertical', () => {
  const d = sample();
  d.nodes.a.style.side = 'left';
  let { boxes: B } = L.computeLayout(d, size);
  assert.strictEqual(B.root.x - (B.a.x + B.a.w), 96);
  d.settings.layout = 'vertical';
  ({ boxes: B } = L.computeLayout(d, size));
  assert.strictEqual(B.a.y - (B.root.y + B.root.h), 96);
  assert.strictEqual(B.b1.y - (B.b.y + B.b.h), 96);
});

test('plegar oculta descendientes y cuenta los ocultos', () => {
  const d = sample();
  d.nodes.b.style.collapsed = true;
  const { boxes: B } = L.computeLayout(d, size);
  assert.strictEqual(B.b.hidden, 3);
  assert.ok(!B.b1.visible && !B.n.visible);
});

test('un hijo único de varias líneas recibe la rama recta, a la mitad de su texto', () => {
  const doc = sample();
  // n (hijo único de b2) ocupa tres líneas.
  const tall = (id) => (id === 'n' ? { w: 299, h: 72 } : size(id));
  const { boxes: B, connectors } = L.computeLayout(doc, tall);
  const c = connectors.find((x) => x.id === 'n');
  const p = nums(c.d);
  const startY = p[1], endY = p[p.length - 1];
  assert.strictEqual(startY, B.b2.y + B.b2.h / 2, 'sale de la mitad del padre');
  assert.strictEqual(endY, B.n.y + B.n.h / 2, 'llega a la mitad del hijo');
  assert.strictEqual(startY, endY, 'recta: el hijo está centrado con su padre');
});
