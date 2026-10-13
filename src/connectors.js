// Geometría de conectores: anclajes en los lados de los objetos, rutas (codo, curva, recta),
// puntas de flecha y posición del texto sobre la línea. Sin DOM: se puede probar en Node.
(function (root) {
  'use strict';
  // Textos de la interfaz (en Node, para las pruebas, se quedan en español).
  const t = (root.MMI18n && root.MMI18n.t) || ((s) => s);
  const GAP = 6; // separación entre el objeto y el extremo del conector
  const OUT = 24; // tramo recto inicial al salir de un lado (rutas en codo)
  const NORMAL = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
  const r1 = (v) => Math.round(v * 10) / 10;

  const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];

  // Lado de `r` que mira hacia el otro extremo: por el eje en que el hueco entre ambos es mayor.
  function facingSide(r, [x, y], other) {
    const [cx, cy] = center(r);
    if (other) {
      const gapX = Math.max(other.x - (r.x + r.w), r.x - (other.x + other.w));
      const gapY = Math.max(other.y - (r.y + r.h), r.y - (other.y + other.h));
      if (gapX >= gapY) return x > cx ? 'right' : 'left';
      return y > cy ? 'bottom' : 'top';
    }
    const dx = (x - cx) / Math.max(1, r.w), dy = (y - cy) / Math.max(1, r.h);
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
  }

  function sidePoint(r, side) {
    const [cx, cy] = center(r);
    const [nx, ny] = NORMAL[side];
    return [cx + nx * (r.w / 2 + GAP), cy + ny * (r.h / 2 + GAP)];
  }

  // Extremos ya resueltos: { p: [x, y], n: [nx, ny] }. `rects` da el rectángulo de un objeto conectado.
  function resolve(conn, rects) {
    const fr = conn.from.ref ? rects(conn.from.ref) : null;
    const tr = conn.to.ref ? rects(conn.to.ref) : null;
    const pf = fr ? center(fr) : [conn.from.x, conn.from.y];
    const pt = tr ? center(tr) : [conn.to.x, conn.to.y];
    const end = (e, r, other, otherRect) => {
      if (!r) {
        const dx = other[0] - e.x, dy = other[1] - e.y;
        const n = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
        return { p: [e.x, e.y], n, free: true };
      }
      const side = e.side && e.side !== 'auto' ? e.side : facingSide(r, other, otherRect);
      return { p: sidePoint(r, side), n: NORMAL[side], side };
    };
    return { a: end(conn.from, fr, pt, tr), b: end(conn.to, tr, pf, fr) };
  }

  const stub = (e) => [e.p[0] + e.n[0] * OUT, e.p[1] + e.n[1] * OUT];
  const same = (p, q) => Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5;
  const sgn = (p, q) => [Math.abs(q[0] - p[0]) < 0.5 ? 0 : Math.sign(q[0] - p[0]), Math.abs(q[1] - p[1]) < 0.5 ? 0 : Math.sign(q[1] - p[1])];

  // Quita puntos repetidos y une los alineados. Con `strict`, devuelve null si hay un tramo en diagonal
  // o la ruta da media vuelta sobre sí misma (por ejemplo, volver hacia el objeto nada más salir).
  function clean(raw, strict) {
    const p = [];
    for (const q of raw) if (!p.length || !same(p[p.length - 1], q)) p.push(q);
    if (strict) {
      for (let i = 1; i < p.length; i++) {
        const d = sgn(p[i - 1], p[i]);
        if (d[0] && d[1]) return null;
        if (i >= 2) { const e = sgn(p[i - 2], p[i - 1]); if (d[0] === -e[0] && d[1] === -e[1]) return null; }
      }
    }
    const out = [];
    for (const q of p) {
      if (out.length >= 2) {
        const a = out[out.length - 2], b = out[out.length - 1];
        if ((Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - q[0]) < 0.5) || (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - q[1]) < 0.5)) out.pop();
      }
      out.push(q);
    }
    return out;
  }

  // Una ruta en codo se describe por sus canales: las líneas (x = v o y = v) por las que pasan los tramos
  // intermedios. Sale recto de cada lado (tramo OUT) y va de canal en canal hasta el otro extremo.
  function fromChannels(a, b, chans, strict) {
    const A = stub(a), B = stub(b);
    const pts = [a.p, A];
    let cur = A;
    for (const c of chans) { cur = c.axis === 'x' ? [c.v, cur[1]] : [cur[0], c.v]; pts.push(cur); }
    const last = chans[chans.length - 1];
    if (last) pts.push(last.axis === 'x' ? [cur[0], B[1]] : [B[0], cur[1]]);
    else pts.push(a.n[0] ? [B[0], A[1]] : [A[0], B[1]]);
    pts.push(B, b.p);
    return clean(pts, strict);
  }

  // Canales de una ruta ya dibujada: un tramo vertical es un canal x, uno horizontal un canal y.
  // El primero y el último no cuentan (van pegados a los objetos).
  function channelsOf(pts) {
    const out = [];
    for (let i = 1; i < pts.length - 2; i++) {
      const vertical = Math.abs(pts[i][0] - pts[i + 1][0]) < 0.5;
      out.push(vertical ? { axis: 'x', v: pts[i][0] } : { axis: 'y', v: pts[i][1] });
    }
    return out;
  }

  // Al arrastrar el tramo `i` de una ruta: canales a guardar y cuál se mueve. Si el tramo va pegado a un
  // objeto, se crea un canal nuevo junto a ese extremo (aparece un codo y el lado de salida no cambia).
  function dragSegment(pts, i) {
    const chans = channelsOf(pts);
    const n = pts.length - 1;
    const vertical = Math.abs(pts[i][0] - pts[i + 1][0]) < 0.5;
    const ch = vertical ? { axis: 'x', v: pts[i][0] } : { axis: 'y', v: pts[i][1] };
    if (n === 1) return { chans: [ch], k: 0, axis: ch.axis };
    if (i === 0) return { chans: [ch, ...chans], k: 0, axis: ch.axis };
    if (i === n - 1) return { chans: [...chans, ch], k: chans.length, axis: ch.axis };
    return { chans, k: i - 1, axis: chans[i - 1].axis };
  }

  // Punto medio del hueco entre dos intervalos (null si se solapan).
  const gapMid = (a0, a1, b0, b1) => (a1 <= b0 ? (a1 + b0) / 2 : b1 <= a0 ? (b1 + a0) / 2 : null);

  // Ruta automática con los lados ya fijados: prueba caminos de hasta tres canales por el hueco entre los
  // objetos, por la altura o el ancho de las salidas o rodeándolos por fuera. Gana el más corto que no
  // atraviese ninguno de los dos; cada codo cuenta un poco y, a igualdad, se prefiere el centro del hueco.
  function routeElbow(a, b, fr, tr) {
    const A = stub(a), B = stub(b);
    const boxes = [fr, tr].filter(Boolean);
    const xs = [], ys = [];
    const add = (list, v, tag) => { if (v != null && !list.some((o) => Math.abs(o.v - v) < 0.5)) list.push({ v, tag }); };
    if (fr && tr) {
      add(xs, gapMid(fr.x, fr.x + fr.w, tr.x, tr.x + tr.w), 'gap');
      add(ys, gapMid(fr.y, fr.y + fr.h, tr.y, tr.y + tr.h), 'gap');
    }
    add(xs, (A[0] + B[0]) / 2, 'half');
    add(ys, (A[1] + B[1]) / 2, 'half');
    for (const P of [A, B]) { add(xs, P[0], 'end'); add(ys, P[1], 'end'); }
    add(xs, Math.min(A[0], B[0], ...boxes.map((r) => r.x - OUT)), 'out');
    add(xs, Math.max(A[0], B[0], ...boxes.map((r) => r.x + r.w + OUT)), 'out');
    add(ys, Math.min(A[1], B[1], ...boxes.map((r) => r.y - OUT)), 'out');
    add(ys, Math.max(A[1], B[1], ...boxes.map((r) => r.y + r.h + OUT)), 'out');

    const X = xs.map((o) => ({ axis: 'x', ...o })), Y = ys.map((o) => ({ axis: 'y', ...o }));
    const cands = [[]];
    for (const c of [...X, ...Y]) cands.push([c]);
    for (const x of X) for (const y of Y) cands.push([x, y], [y, x]);
    for (const x of X) for (const y of Y) for (const x2 of X) if (x2 !== x) cands.push([x, y, x2]);
    for (const y of Y) for (const x of X) for (const y2 of Y) if (y2 !== y) cands.push([y, x, y2]);
    const PREF = { gap: 0, half: 0.5, end: 1, out: 1 };
    let best = null;
    for (const chans of cands) {
      const pts = fromChannels(a, b, chans, true);
      if (!pts) continue;
      let len = 0, hits = 0;
      for (let i = 1; i < pts.length; i++) {
        len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
        for (const r of boxes) if (crosses(pts[i - 1], pts[i], r)) hits++;
      }
      const score = len + (pts.length - 2) * 16 + hits * 100000 + chans.reduce((s, c) => s + PREF[c.tag], 0);
      if (!best || score < best.score) best = { score, pts, hits };
    }
    return best;
  }

  // Polilínea con esquinas redondeadas.
  function roundedPath(pts, radius = 10) {
    let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
      const rr = Math.min(radius, l1 / 2, l2 / 2);
      const ax = x - ((x - px) / l1) * rr, ay = y - ((y - py) / l1) * rr;
      const bx = x + ((nx - x) / l2) * rr, by = y + ((ny - y) / l2) * rr;
      d += `L${r1(ax)},${r1(ay)}Q${r1(x)},${r1(y)} ${r1(bx)},${r1(by)}`;
    }
    const last = pts[pts.length - 1];
    return `${d}L${r1(last[0])},${r1(last[1])}`;
  }

  // ¿Atraviesa un tramo horizontal o vertical el interior del rectángulo?
  function crosses([x0, y0], [x1, y1], r) {
    const m = 1;
    if (Math.abs(y0 - y1) < 0.5) return y0 > r.y + m && y0 < r.y + r.h - m && Math.max(x0, x1) > r.x + m && Math.min(x0, x1) < r.x + r.w - m;
    if (Math.abs(x0 - x1) < 0.5) return x0 > r.x + m && x0 < r.x + r.w - m && Math.max(y0, y1) > r.y + m && Math.min(y0, y1) < r.y + r.h - m;
    return false;
  }

  // Ruta en codo. Los lados guardados se respetan siempre; solo los que están en 'auto' (conectores sin
  // lado decidido aún) se eligen probando las combinaciones y quedándose con la mejor ruta.
  function elbow(conn, rects, ends) {
    const fr = conn.from.ref ? rects(conn.from.ref) : null;
    const tr = conn.to.ref ? rects(conn.to.ref) : null;
    const opts = (e, r, fixed) => (r && !(e.side && e.side !== 'auto') ? Object.keys(NORMAL).map((s) => ({ p: sidePoint(r, s), n: NORMAL[s], side: s })) : [fixed]);
    let best = null;
    for (const a of opts(conn.from, fr, ends.a)) {
      for (const b of opts(conn.to, tr, ends.b)) {
        const r = routeElbow(a, b, fr, tr);
        if (r && (!best || r.score < best.score)) best = { ...r, a, b };
      }
    }
    return best;
  }

  // Muestra la ruta como polilínea (sirve para el texto, la longitud y la detección de clics).
  function geometry(conn, rects) {
    let { a, b } = resolve(conn, rects);
    const route = conn.route || 'elbow';
    let pts = null;
    if (route === 'elbow') {
      // Ruta retocada a mano: sus canales se mantienen aunque se muevan los objetos.
      if (Array.isArray(conn.chans)) pts = fromChannels(a, b, conn.chans, false);
      else { const r = elbow(conn, rects, { a, b }); if (r) ({ a, b, pts } = r); }
    }
    let d, samples, startDir, endDir;
    if (route === 'straight') {
      samples = [a.p, b.p];
      d = `M${r1(a.p[0])},${r1(a.p[1])}L${r1(b.p[0])},${r1(b.p[1])}`;
    } else if (route === 'curve') {
      const dist = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
      const k = Math.max(40, dist * 0.42);
      const c1 = [a.p[0] + a.n[0] * k, a.p[1] + a.n[1] * k];
      const c2 = [b.p[0] + b.n[0] * k, b.p[1] + b.n[1] * k];
      d = `M${r1(a.p[0])},${r1(a.p[1])}C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${r1(b.p[0])},${r1(b.p[1])}`;
      samples = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32, u = 1 - t;
        samples.push([u * u * u * a.p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.p[0],
          u * u * u * a.p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.p[1]]);
      }
    } else {
      samples = pts || [a.p, b.p];
      d = roundedPath(samples);
    }
    const n = samples.length;
    startDir = dir(samples[1], samples[0]);
    endDir = dir(samples[n - 2], samples[n - 1]);
    return { a, b, d, samples, startDir, endDir };
  }

  const dir = (from, to) => { const dx = to[0] - from[0], dy = to[1] - from[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };

  function lengthOf(samples) {
    let L = 0;
    for (let i = 1; i < samples.length; i++) L += Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
    return L;
  }

  // Punto a la fracción t (0..1) de la longitud.
  function pointAt(samples, t) {
    const L = lengthOf(samples) * Math.min(1, Math.max(0, t));
    let acc = 0;
    for (let i = 1; i < samples.length; i++) {
      const [x0, y0] = samples[i - 1], [x1, y1] = samples[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (acc + seg >= L) { const k = seg ? (L - acc) / seg : 0; return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]; }
      acc += seg;
    }
    return samples[samples.length - 1];
  }

  // Fracción t del punto de la ruta más cercano a p, y su distancia (para arrastrar el texto o detectar clics).
  function nearest(samples, [px, py]) {
    const L = lengthOf(samples) || 1;
    let best = { t: 0, dist: Infinity }, acc = 0;
    for (let i = 1; i < samples.length; i++) {
      const [x0, y0] = samples[i - 1], [x1, y1] = samples[i];
      const dx = x1 - x0, dy = y1 - y0, seg = Math.hypot(dx, dy);
      const k = seg ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (seg * seg))) : 0;
      const qx = x0 + dx * k, qy = y0 + dy * k;
      const dist = Math.hypot(px - qx, py - qy);
      if (dist < best.dist) best = { t: (acc + seg * k) / L, dist };
      acc += seg;
    }
    return best;
  }

  // Puntas: 8 tipos más ninguna. Devuelve SVG en la punta `p` mirando hacia `d`.
  const CAPS = [['none', t('Ninguna')], ['arrow', t('Flecha')], ['triangle', t('Triángulo')], ['triangle-open', t('Triángulo vacío')], ['circle', t('Círculo')],
    ['circle-open', t('Círculo vacío')], ['diamond', t('Rombo')], ['diamond-open', t('Rombo vacío')], ['bar', t('Barra')]];

  function cap(kind, p, d, color, width, surface) {
    if (!kind || kind === 'none') return '';
    const s = 4 + width * 2.2; // tamaño proporcional al grosor
    const [ux, uy] = d, [vx, vy] = [-uy, ux];
    const at = (a, b) => `${r1(p[0] - ux * a + vx * b)},${r1(p[1] - uy * a + vy * b)}`;
    const sw = `stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;
    switch (kind) {
      case 'arrow': return `<path d="M${at(s, s * 0.65)}L${at(0, 0)}L${at(s, -s * 0.65)}" fill="none" ${sw}/>`;
      case 'triangle': return `<path d="M${at(0, 0)}L${at(s * 1.1, s * 0.6)}L${at(s * 1.1, -s * 0.6)}Z" fill="${color}" ${sw}/>`;
      case 'triangle-open': return `<path d="M${at(0, 0)}L${at(s * 1.1, s * 0.6)}L${at(s * 1.1, -s * 0.6)}Z" fill="${surface}" ${sw}/>`;
      case 'circle': return `<circle cx="${r1(p[0] - ux * s * 0.5)}" cy="${r1(p[1] - uy * s * 0.5)}" r="${r1(s * 0.5)}" fill="${color}" ${sw}/>`;
      case 'circle-open': return `<circle cx="${r1(p[0] - ux * s * 0.5)}" cy="${r1(p[1] - uy * s * 0.5)}" r="${r1(s * 0.5)}" fill="${surface}" ${sw}/>`;
      case 'diamond': return `<path d="M${at(0, 0)}L${at(s * 0.7, s * 0.5)}L${at(s * 1.4, 0)}L${at(s * 0.7, -s * 0.5)}Z" fill="${color}" ${sw}/>`;
      case 'diamond-open': return `<path d="M${at(0, 0)}L${at(s * 0.7, s * 0.5)}L${at(s * 1.4, 0)}L${at(s * 0.7, -s * 0.5)}Z" fill="${surface}" ${sw}/>`;
      case 'bar': return `<path d="M${at(width, s * 0.7)}L${at(width, -s * 0.7)}" ${sw}/>`;
      default: return '';
    }
  }

  // Lado de `r` al que se engancha un conector soltado en p: el borde más cercano (dentro o fuera del
  // objeto), no el más cercano al centro, para que funcione igual en formas alargadas.
  function nearestSide(r, [x, y]) {
    const dist = { top: Math.abs(y - r.y), bottom: Math.abs(y - (r.y + r.h)), left: Math.abs(x - r.x), right: Math.abs(x - (r.x + r.w)) };
    return Object.keys(dist).reduce((a, b) => (dist[b] < dist[a] ? b : a));
  }

  const api = { resolve, geometry, nearestSide, dragSegment, channelsOf, pointAt, nearest, lengthOf, cap, CAPS, facingSide, NORMAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMConnectors = api;
})(typeof window !== 'undefined' ? window : globalThis);
