// Dibujo a mano: trazo suavizado, detección de formas, goma y lazo. Sin DOM: se puede probar en Node.
(function (root) {
  'use strict';
  const r1 = (v) => Math.round(v * 10) / 10;

  // Trazo suave: curvas cuadráticas por los puntos medios.
  function smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length < 3) return `M${pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join('L')}`;
    let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [nx, ny] = pts[i + 1];
      d += `Q${r1(x)},${r1(y)} ${r1((x + nx) / 2)},${r1((y + ny) / 2)}`;
    }
    const l = pts[pts.length - 1];
    return `${d}L${r1(l[0])},${r1(l[1])}`;
  }

  // Quita puntos casi repetidos (el ratón manda muchos).
  function simplify(pts, min = 1.5) {
    const out = [pts[0]];
    for (const p of pts.slice(1)) {
      const q = out[out.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= min) out.push(p);
    }
    if (out.length === 1 && pts.length > 1) out.push(pts[pts.length - 1]);
    return out;
  }

  const bbox = (pts) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  };

  const segDist = ([px, py], [x0, y0], [x1, y1]) => {
    const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L)) : 0;
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  };

  // Distancia media de los puntos a un contorno (polígono cerrado de muestras).
  const meanDist = (pts, outline) => pts.reduce((s, p) => {
    let m = Infinity;
    for (let i = 0; i < outline.length; i++) m = Math.min(m, segDist(p, outline[i], outline[(i + 1) % outline.length]));
    return s + m;
  }, 0) / pts.length;

  // «Detectar formas»: líneas rectas, rectángulos, círculos/elipses y rombos se vuelven regulares.
  function recognize(pts) {
    if (pts.length < 4) return null;
    const b = bbox(pts);
    const size = Math.hypot(b.w, b.h);
    if (size < 16) return null;
    const first = pts[0], last = pts[pts.length - 1];
    const chord = Math.hypot(last[0] - first[0], last[1] - first[1]);
    // Línea: todos los puntos cerca de la recta entre los extremos.
    const maxOff = Math.max(...pts.map((p) => segDist(p, first, last)));
    if (chord > size * 0.85 && maxOff < Math.max(6, chord * 0.06)) return { kind: 'line', pts: [first, last] };
    // Formas cerradas: el final vuelve cerca del principio.
    if (chord > size * 0.3) return null;
    const { x, y, w, h } = b, cx = x + w / 2, cy = y + h / 2;
    const ellipse = [...Array(48)].map((_, i) => { const a = (i / 48) * Math.PI * 2; return [cx + (w / 2) * Math.cos(a), cy + (h / 2) * Math.sin(a)]; });
    const rect = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const diamond = [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
    const cands = [['ellipse', ellipse], ['rect', rect], ['diamond', diamond]].map(([k, o]) => [k, o, meanDist(pts, o)]);
    cands.sort((p, q) => p[2] - q[2]);
    const [kind, outline, err] = cands[0];
    if (err > size * 0.08) return null;
    return { kind, pts: [...outline, outline[0]] };
  }

  // ¿Toca la goma (círculo en p, radio r) algún tramo del trazo?
  function hits(pts, p, r) {
    if (pts.length === 1) return Math.hypot(pts[0][0] - p[0], pts[0][1] - p[1]) <= r;
    for (let i = 1; i < pts.length; i++) if (segDist(p, pts[i - 1], pts[i]) <= r) return true;
    return false;
  }

  // ¿Está el punto dentro del polígono del lazo? (regla par-impar)
  function inside(poly, [x, y]) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }

  const api = { smoothPath, simplify, recognize, hits, inside, bbox };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMInk = api;
})(typeof window !== 'undefined' ? window : globalThis);
