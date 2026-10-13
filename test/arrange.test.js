const test = require('node:test');
const assert = require('node:assert');
const A = require('../src/arrange.js');

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const placed = (rects, pos) => rects.map((r) => ({ ...r, ...pos[r.id] }));

test('cuadrícula: casi cuadrada, en orden de lectura y sin solapes', () => {
  const rects = [['a', 300, 10], ['b', 10, 0], ['c', 160, 220], ['d', 20, 200], ['e', 500, 400]].map(([id, x, y]) => ({ id, x, y, w: 100, h: 60 }));
  const pos = A.grid(rects);
  const out = placed(rects, pos);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(!overlap(out[i], out[j]), `${out[i].id} y ${out[j].id} se solapan`);
  // 5 objetos → 3 columnas: primera fila b, a, d (los tres más altos, de izquierda a derecha).
  assert.deepStrictEqual([pos.b, pos.a, pos.d].map((p) => p.y), [0, 0, 0]);
  assert.ok(pos.b.x < pos.a.x && pos.a.x < pos.d.x);
  assert.ok(pos.c.y > 0 && pos.e.y > 0);
});

test('árbol: la raíz no se mueve, los hijos van debajo en su orden y centrados', () => {
  const r = (id, x, y) => ({ id, x, y, w: 120, h: 60 });
  const rects = [r('root', 400, 0), r('k2', 600, 300), r('k1', 100, 250), r('g', 90, 500)];
  const { pos, tree } = A.tree(rects, [['root', 'k1'], ['root', 'k2'], ['k1', 'g']], 'down');
  assert.deepStrictEqual(pos.root, { x: 400, y: 0 });
  assert.ok(pos.k1.y === pos.k2.y && pos.k1.y >= 60 + 80, 'los hijos comparten nivel por debajo de la raíz');
  assert.ok(pos.k1.x < pos.k2.x, 'conservan el orden de izquierda a derecha');
  const mid = (pos.k1.x + pos.k2.x) / 2;
  assert.ok(Math.abs(mid - pos.root.x) <= 1, 'la raíz queda centrada sobre sus hijos');
  assert.ok(pos.g.y > pos.k1.y && pos.g.x === pos.k1.x, 'el nieto va bajo su padre');
  assert.ok(tree.has('root>k1') && tree.has('k1>g'));
  const out = placed(rects, pos);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(!overlap(out[i], out[j]));
});

test('mapa mental: de izquierda a derecha; varias raíces, ciclos y uniones repetidas no rompen nada', () => {
  const r = (id, x, y) => ({ id, x, y, w: 100, h: 50 });
  const rects = [r('a', 0, 0), r('b', 300, 0), r('c', 300, 200), r('x', 0, 500), r('y', 200, 600)];
  const { pos, tree } = A.tree(rects, [['a', 'b'], ['a', 'c'], ['b', 'c'], ['c', 'a'], ['x', 'y'], ['y', 'x']], 'right');
  assert.ok(pos.b.x > pos.a.x + 100 && pos.c.x === pos.b.x, 'los hijos van a la derecha, en el mismo nivel');
  assert.ok(!tree.has('b>c'), 'c cuelga de a, no de b');
  const out = placed(rects, pos);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(!overlap(out[i], out[j]));
  assert.strictEqual(Object.keys(pos).length, 5);
});
