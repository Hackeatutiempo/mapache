// Formas de diagrama: catálogo y generador de paths SVG para un tamaño w × h.
(function (root) {
  'use strict';
  const t = root.MMI18n.t;
  const r = (v) => Math.round(v * 10) / 10;

  function poly(pts) { return `M${pts.map(([x, y]) => `${r(x)},${r(y)}`).join('L')}Z`; }

  // Nube: arcos que abultan hacia fuera sobre una elipse.
  function cloud(w, h) {
    const n = 9, cx = w / 2, cy = h / 2, rx = w * 0.4, ry = h * 0.34;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      const rad = Math.hypot(x2 - x1, y2 - y1) * 0.62;
      d += `A${r(rad)},${r(rad)} 0 0 1 ${r(x2)},${r(y2)}`;
    }
    return `${d}Z`;
  }

  function star(w, h) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * i) / 5 - Math.PI / 2;
      const k = i % 2 ? 0.42 : 1;
      pts.push([w / 2 + (w / 2) * k * Math.cos(a), h * 0.53 + (h / 2) * k * Math.sin(a)]);
    }
    return poly(pts);
  }

  // Devuelve { body, extra } (extra: trazos adicionales sin relleno, p. ej. el borde del cilindro).
  function path(kind, w, h) {
    switch (kind) {
      case 'rect': { const q = Math.min(6, w / 4, h / 4); return { body: `M${q},0H${w - q}Q${w},0 ${w},${q}V${h - q}Q${w},${h} ${w - q},${h}H${q}Q0,${h} 0,${h - q}V${q}Q0,0 ${q},0Z` }; }
      case 'pill': { const q = Math.min(h, w) / 2; return { body: `M${q},0H${w - q}A${q},${q} 0 0 1 ${w - q},${h}H${q}A${q},${q} 0 0 1 ${q},0Z` }; }
      case 'oval': return { body: `M0,${h / 2}A${w / 2},${h / 2} 0 1 1 ${w},${h / 2}A${w / 2},${h / 2} 0 1 1 0,${h / 2}Z` };
      case 'diamond': return { body: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) };
      case 'parallelogram': { const s = Math.min(w * 0.22, h * 0.6); return { body: poly([[s, 0], [w, 0], [w - s, h], [0, h]]) }; }
      case 'parallelogram2': { const s = Math.min(w * 0.22, h * 0.6); return { body: poly([[0, 0], [w - s, 0], [w, h], [s, h]]) }; }
      case 'trapezoid': { const s = Math.min(w * 0.2, h * 0.6); return { body: poly([[s, 0], [w - s, 0], [w, h], [0, h]]) }; }
      case 'triangle': return { body: poly([[w / 2, 0], [w, h], [0, h]]) };
      case 'hexagon': { const s = Math.min(w * 0.25, h * 0.5); return { body: poly([[s, 0], [w - s, 0], [w, h / 2], [w - s, h], [s, h], [0, h / 2]]) }; }
      case 'cylinder': {
        const ry = Math.min(h * 0.14, 18);
        return {
          body: `M0,${ry}A${w / 2},${ry} 0 0 1 ${w},${ry}V${h - ry}A${w / 2},${ry} 0 0 1 0,${h - ry}Z`,
          extra: `M0,${ry}A${w / 2},${ry} 0 0 0 ${w},${ry}`,
        };
      }
      case 'cloud': return { body: cloud(w, h) };
      case 'star': return { body: star(w, h) };
      default: return { body: poly([[0, 0], [w, 0], [w, h], [0, h]]) };
    }
  }

  // Zona donde va el texto (en proporción), para formas estrechas por arriba o los lados.
  const TEXT_INSET = { diamond: [0.16, 0.2], triangle: [0.25, 0.45, 0.08], hexagon: [0.18, 0.1], star: [0.3, 0.32], cloud: [0.16, 0.2], cylinder: [0.06, 0.22] };

  // Catálogo: [clave, nombre, tecla, tamaño por defecto]
  const CATALOG = [
    ['rect', t('Rectángulo'), 'R', [160, 100]],
    ['pill', t('Píldora'), 'U', [160, 64]],
    ['oval', t('Óvalo'), 'O', [120, 120]],
    ['diamond', t('Rombo'), 'D', [140, 140]],
    ['parallelogram', t('Paralelogramo'), '', [170, 100]],
    ['parallelogram2', t('Paralelogramo inverso'), '', [170, 100]],
    ['trapezoid', t('Trapecio'), 'A', [170, 100]],
    ['triangle', t('Triángulo'), 'G', [130, 110]],
    ['hexagon', t('Hexágono'), '', [160, 110]],
    ['cylinder', t('Cilindro'), 'Y', [120, 140]],
    ['cloud', t('Nube'), 'J', [190, 130]],
    ['star', t('Estrella'), '', [130, 125]],
  ];

  // Miniatura para menús.
  function thumb(kind) {
    const p = path(kind, 26, 20);
    return `<svg viewBox="-2 -2 30 24" width="28" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="${p.body}"/>${p.extra ? `<path d="${p.extra}"/>` : ''}</svg>`;
  }

  root.MMShapes = { path, CATALOG, TEXT_INSET, thumb };
})(window);
