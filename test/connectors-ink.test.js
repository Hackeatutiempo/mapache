const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/connectors.js');
const I = require('../src/ink.js');

const rects = { a: { x: 0, y: 0, w: 100, h: 60 }, b: { x: 300, y: 200, w: 100, h: 60 }, c: { x: 0, y: 300, w: 100, h: 60 } };
const R = (id) => rects[id];

test('el conector sale por los lados que se miran y no toca los objetos', () => {
  const g = C.geometry({ from: { ref: 'a' }, to: { ref: 'b' }, route: 'elbow' }, R);
  assert.strictEqual(g.a.side, 'right');
  assert.strictEqual(g.b.side, 'left');
  assert.deepStrictEqual(g.a.p, [106, 30]);
  assert.deepStrictEqual(g.b.p, [294, 230]);
});

test('ruta en codo: solo tramos horizontales y verticales; los tramos se arrastran', () => {
  const g = C.geometry({ from: { ref: 'a' }, to: { ref: 'b' }, route: 'elbow' }, R);
  for (let i = 1; i < g.samples.length; i++) {
    const [x0, y0] = g.samples[i - 1], [x1, y1] = g.samples[i];
    assert.ok(x0 === x1 || y0 === y1, `tramo diagonal ${g.samples[i - 1]} → ${g.samples[i]}`);
  }
  // Tramo central (vertical): se desplaza en x.
  const mid = C.dragSegment(g.samples, 1);
  assert.strictEqual(mid.axis, 'x');
  mid.chans[mid.k].v = 250;
  const moved = C.geometry({ from: { ref: 'a', side: 'right' }, to: { ref: 'b', side: 'left' }, route: 'elbow', chans: mid.chans }, R);
  assert.ok(moved.samples.some(([x]) => x === 250));
  // Tramo pegado al objeto: aparece un codo nuevo y el extremo sigue saliendo por el mismo lado.
  const first = C.dragSegment(g.samples, 0);
  assert.strictEqual(first.axis, 'y');
  first.chans[first.k].v = -40;
  const jog = C.geometry({ from: { ref: 'a', side: 'right' }, to: { ref: 'b', side: 'left' }, route: 'elbow', chans: first.chans }, R);
  assert.deepStrictEqual(jog.samples[0], [106, 30]);
  assert.deepStrictEqual(jog.samples[1], [130, 30]);
  assert.ok(jog.samples.some(([, y]) => y === -40));
  // Si luego se mueve un objeto, el tramo retocado se queda donde se dejó.
  const R2 = (id) => (id === 'b' ? { x: 320, y: 260, w: 100, h: 60 } : rects[id]);
  const after = C.geometry({ from: { ref: 'a', side: 'right' }, to: { ref: 'b', side: 'left' }, route: 'elbow', chans: mid.chans }, R2);
  assert.ok(after.samples.some(([x]) => x === 250));
  assert.deepStrictEqual(after.samples[after.samples.length - 1], [314, 290]);
});

test('lados fijos: la salida no cambia al mover y el recorrido rodea las formas (como en la referencia)', () => {
  const r = { top: { x: 825, y: 105, w: 137, h: 120 }, b: { x: 785, y: 303, w: 137, h: 120 }, c: { x: 424, y: 278, w: 137, h: 120 }, d: { x: 284, y: 626, w: 136, h: 120 } };
  const route = (f, fs, t, ts) => C.geometry({ from: { ref: f, side: fs }, to: { ref: t, side: ts }, route: 'elbow' }, (id) => r[id]).samples;
  // Derecha → izquierda con el destino debajo y a la izquierda: baja por el hueco entre ambas.
  assert.deepStrictEqual(route('top', 'right', 'b', 'left'), [[968, 165], [992, 165], [992, 264], [755, 264], [755, 363], [779, 363]]);
  // Abajo → arriba con el destino a la izquierda y a la misma altura: pasa por el hueco vertical.
  assert.deepStrictEqual(route('b', 'bottom', 'c', 'top'), [[853.5, 429], [853.5, 453], [673, 453], [673, 248], [492.5, 248], [492.5, 272]]);
  // Derecha → izquierda con el destino muy abajo a la izquierda.
  assert.deepStrictEqual(route('c', 'right', 'd', 'left'), [[567, 338], [591, 338], [591, 512], [254, 512], [254, 686], [278, 686]]);
});

test('al mover las formas el codo cambia de lados y no atraviesa ninguna (caso real)', () => {
  // Nube arriba a la derecha y píldora abajo a la izquierda, solapadas en horizontal.
  const r = { cloud: { x: 338, y: 88, w: 280, h: 147 }, pill: { x: 137, y: 405, w: 348, h: 159 } };
  const g = C.geometry({ from: { ref: 'cloud', side: 'auto' }, to: { ref: 'pill', side: 'auto' }, route: 'elbow' }, (id) => r[id]);
  const inside = (p, q) => p[0] > q.x + 1 && p[0] < q.x + q.w - 1 && p[1] > q.y + 1 && p[1] < q.y + q.h - 1;
  for (let i = 1; i < g.samples.length; i++) {
    const [x0, y0] = g.samples[i - 1], [x1, y1] = g.samples[i];
    for (let k = 0; k <= 20; k++) {
      const p = [x0 + ((x1 - x0) * k) / 20, y0 + ((y1 - y0) * k) / 20];
      assert.ok(!inside(p, r.cloud) && !inside(p, r.pill), `el tramo ${g.samples[i - 1]} → ${g.samples[i]} atraviesa una forma`);
    }
  }
  // La ruta mala de la captura salía por la derecha de la nube y entraba por la izquierda de la píldora.
  assert.notDeepStrictEqual([g.a.side, g.b.side], ['right', 'left']);
});

test('lados forzados, extremo libre, curva y recta', () => {
  const g = C.geometry({ from: { ref: 'a', side: 'bottom' }, to: { ref: 'c', side: 'top' }, route: 'elbow' }, R);
  assert.deepStrictEqual(g.endDir, [0, 1]);
  const free = C.geometry({ from: { ref: 'a' }, to: { x: 500, y: 30 }, route: 'straight' }, R);
  assert.deepStrictEqual(free.b.p, [500, 30]);
  const curve = C.geometry({ from: { ref: 'a' }, to: { ref: 'b' }, route: 'curve' }, R);
  assert.match(curve.d, /C/);
});

test('el texto se coloca y se desliza a lo largo de la línea', () => {
  const s = [[0, 0], [100, 0], [100, 100]];
  assert.deepStrictEqual(C.pointAt(s, 0.5), [100, 0]);
  const n = C.nearest(s, [100, 60]);
  assert.ok(Math.abs(n.t - 0.8) < 1e-9 && n.dist === 0);
});

test('detectar formas: línea, rectángulo, círculo y garabato', () => {
  const line = [...Array(20)].map((_, i) => [i * 10, i % 2]);
  assert.strictEqual(I.recognize(line).kind, 'line');
  const rect = [[0, 0], [50, 0], [100, 1], [100, 50], [99, 100], [50, 100], [0, 99], [1, 50], [2, 3]];
  assert.strictEqual(I.recognize(rect).kind, 'rect');
  const circle = [...Array(40)].map((_, i) => [50 + 50 * Math.cos((i / 40) * 6.2), 50 + 50 * Math.sin((i / 40) * 6.2)]);
  assert.strictEqual(I.recognize(circle).kind, 'ellipse');
  const scribble = [[0, 0], [80, 20], [10, 60], [90, 90], [5, 100], [60, 5]];
  assert.strictEqual(I.recognize(scribble), null);
});

test('goma y lazo', () => {
  assert.ok(I.hits([[0, 0], [100, 0]], [50, 5], 6));
  assert.ok(!I.hits([[0, 0], [100, 0]], [50, 20], 6));
  const poly = [[0, 0], [100, 0], [100, 100], [0, 100]];
  assert.ok(I.inside(poly, [50, 50]));
  assert.ok(!I.inside(poly, [150, 50]));
});

test('al soltar sobre un objeto se engancha al borde más cercano', () => {
  const pill = { x: 205, y: 98, w: 220, h: 149 };
  assert.strictEqual(C.nearestSide(pill, [316, 117]), 'top');
  assert.strictEqual(C.nearestSide(pill, [215, 180]), 'left');
  assert.strictEqual(C.nearestSide(pill, [420, 150]), 'right');
  assert.strictEqual(C.nearestSide(pill, [300, 255]), 'bottom'); // fuera, justo debajo
});

test('la app solo usa funciones que existen en los módulos de conectores y dibujo', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/app.js'), 'utf8');
  for (const [alias, mod] of [['Conn', C], ['Ink', I], ['Arrange', require('../src/arrange.js')]]) {
    for (const [, name] of src.matchAll(new RegExp(`\b${alias}\.(\w+)`, 'g'))) assert.ok(name in mod, `${alias}.${name} no existe`);
  }
});
