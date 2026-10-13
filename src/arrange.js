// Organizar automáticamente lo seleccionado: en cuadrícula, como árbol (de arriba abajo) o como mapa mental
// (de izquierda a derecha). Recibe rectángulos { id, x, y, w, h } y, para los árboles, las uniones [desde, hasta].
// Devuelve posiciones nuevas { id: { x, y } }. Sin DOM: se puede probar en Node.
(function (root) {
  'use strict';
  const GAP = 40; // separación entre objetos vecinos
  const LEVEL = 80; // separación entre niveles de un árbol

  const cx = (r) => r.x + r.w / 2;
  const cy = (r) => r.y + r.h / 2;

  // Cuadrícula casi cuadrada en orden de lectura (por filas según la altura actual, y de izquierda a derecha).
  // Cada columna toma el ancho de su objeto más ancho y cada fila el alto del más alto; los objetos van centrados.
  function grid(rects, gap = GAP) {
    const n = rects.length;
    if (n < 2) return {};
    const cols = Math.ceil(Math.sqrt(n));
    // Orden de lectura: se agrupan en bandas los que se solapan en vertical, y cada banda se lee de izquierda a derecha.
    const bands = [];
    for (const r of [...rects].sort((a, b) => a.y - b.y)) {
      const band = bands.find((b) => r.y < b.bottom && r.y + r.h > b.top);
      if (band) { band.items.push(r); band.bottom = Math.max(band.bottom, r.y + r.h); } else bands.push({ top: r.y, bottom: r.y + r.h, items: [r] });
    }
    const reading = bands.flatMap((b) => b.items.sort((p, q) => p.x - q.x));
    const rows = [];
    for (let i = 0; i < n; i += cols) rows.push(reading.slice(i, i + cols));
    const colW = Array(cols).fill(0);
    for (const row of rows) row.forEach((r, c) => { colW[c] = Math.max(colW[c], r.w); });
    const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
    const out = {};
    let y = y0;
    for (const row of rows) {
      const h = Math.max(...row.map((r) => r.h));
      let x = x0;
      row.forEach((r, c) => {
        out[r.id] = { x: Math.round(x + (colW[c] - r.w) / 2), y: Math.round(y + (h - r.h) / 2) };
        x += colW[c] + gap;
      });
      y += h + gap;
    }
    return out;
  }

  // Árbol ordenado siguiendo las uniones. `dir`: 'down' (árbol) o 'right' (mapa mental).
  // Las raíces son los objetos a los que no llega ninguna unión; si hay ciclos, se empieza por el más alto o
  // el más a la izquierda. Si a un objeto llegan varias uniones, cuelga del primero que lo alcanza; el resto de
  // uniones se devuelven fuera de `tree`. Hermanos y raíces conservan su orden actual. La primera raíz no se mueve.
  function tree(rects, edges, dir = 'down', { gap = GAP, level = LEVEL } = {}) {
    const down = dir !== 'right';
    const byId = new Map(rects.map((r) => [r.id, r]));
    const out = new Map(rects.map((r) => [r.id, []]));
    const indeg = new Map(rects.map((r) => [r.id, 0]));
    for (const [a, b] of edges) {
      if (!byId.has(a) || !byId.has(b) || a === b) continue;
      out.get(a).push(b);
      indeg.set(b, indeg.get(b) + 1);
    }
    const along = (r) => (down ? cx(r) : cy(r)); // dirección en la que se reparten los hermanos
    const across = (r) => (down ? r.y : r.x); // dirección en la que crecen los niveles
    const size = (r) => (down ? r.w : r.h);
    const thick = (r) => (down ? r.h : r.w);

    const parent = new Map(), depth = new Map(), roots = [];
    const grow = (rootId) => {
      roots.push(rootId);
      depth.set(rootId, 0);
      const queue = [rootId];
      while (queue.length) {
        const id = queue.shift();
        const next = out.get(id).map((k) => byId.get(k)).sort((a, b) => along(a) - along(b));
        for (const k of next) {
          if (depth.has(k.id)) continue;
          parent.set(k.id, id);
          depth.set(k.id, depth.get(id) + 1);
          queue.push(k.id);
        }
      }
    };
    const firstOrder = (a, b) => across(a) - across(b) || along(a) - along(b);
    for (const r of rects.filter((x) => !indeg.get(x.id)).sort(firstOrder)) if (!depth.has(r.id)) grow(r.id);
    for (const r of [...rects].sort(firstOrder)) if (!depth.has(r.id)) grow(r.id);
    roots.sort((a, b) => along(byId.get(a)) - along(byId.get(b)));

    const kids = new Map(rects.map((r) => [r.id, []]));
    for (const [k, p] of parent) kids.get(p).push(k);
    for (const list of kids.values()) list.sort((a, b) => along(byId.get(a)) - along(byId.get(b)));

    // Cada nivel tiene el grosor de su objeto más grueso; así los objetos de un mismo nivel quedan alineados.
    const levels = [];
    for (const [id, d] of depth) levels[d] = Math.max(levels[d] || 0, thick(byId.get(id)));
    const offset = [];
    for (let d = 0, acc = 0; d < levels.length; d++) { offset[d] = acc; acc += levels[d] + level; }

    const memo = new Map();
    const span = (id) => {
      if (memo.has(id)) return memo.get(id);
      const ks = kids.get(id);
      const total = ks.reduce((s, k) => s + span(k), 0) + gap * Math.max(0, ks.length - 1);
      const v = Math.max(size(byId.get(id)), total);
      memo.set(id, v);
      return v;
    };
    const pos = {};
    const place = (id, start) => {
      const ks = kids.get(id);
      const total = ks.reduce((s, k) => s + span(k), 0) + gap * Math.max(0, ks.length - 1);
      let s = start + (span(id) - total) / 2;
      for (const k of ks) { place(k, s); s += span(k) + gap; }
      const r = byId.get(id), d = depth.get(id);
      const mid = start + span(id) / 2;
      const lvl = offset[d] + (levels[d] - thick(r)) / 2;
      pos[id] = down ? { x: mid - r.w / 2, y: lvl } : { x: lvl, y: mid - r.h / 2 };
    };
    let start = 0;
    for (const id of roots) { place(id, start); start += span(id) + gap * 2; }

    // La primera raíz se queda donde estaba.
    const r0 = byId.get(roots[0]);
    const dx = r0.x - pos[roots[0]].x, dy = r0.y - pos[roots[0]].y;
    for (const id of Object.keys(pos)) pos[id] = { x: Math.round(pos[id].x + dx), y: Math.round(pos[id].y + dy) };
    return { pos, tree: new Set([...parent].map(([k, p]) => `${p}>${k}`)) };
  }

  const api = { grid, tree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMArrange = api;
})(typeof window !== 'undefined' ? window : globalThis);
