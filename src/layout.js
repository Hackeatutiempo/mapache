// Motor de layout del mapa mental (medidas en DESIGN.md).
(function (root) {
  'use strict';

  // Tipografía y relleno por nivel: raíz, nivel 1, nivel 2+.
  const LEVELS = [
    { size: 27, line: 36, padX: 20, padY: 18, maxText: 400 },
    { size: 21, line: 28, padX: 9, padY: 4, maxText: 320 },
    { size: 18, line: 24, padX: 9, padY: 0, maxText: 320 },
  ];
  const levelStyle = (level) => LEVELS[Math.min(level, LEVELS.length - 1)];

  const PARENT_GAP = 96; // borde del padre → borde del hijo, en todos los niveles
  const siblingGap = (childLevel) => (childLevel <= 1 ? 36 : 24);
  const STROKE = 4;

  // Colores de rama en el orden en que se asignan, más el resto de la paleta.
  const PALETTE = {
    purple: 'oklch(60% 0.2423 322)',
    blue: 'oklch(61% 0.148288 249)',
    green: 'oklch(68% 0.112508 184)',
    orange: 'oklch(71% 0.149045 53)',
    yellow: 'oklch(84% 0.141306 89)',
    red: 'oklch(62% 0.21 25)',
    indigo: 'oklch(55% 0.2 280)',
    magenta: 'oklch(58% 0.25 330)',
    teal: 'oklch(55% 0.1 200)',
    forest: 'oklch(50% 0.1 160)',
    brown: 'oklch(52% 0.06 60)',
    rose: 'oklch(58% 0.12 10)',
    gray: 'oklch(60% 0.02 250)',
    silver: 'oklch(78% 0.01 250)',
    white: 'oklch(96% 0 0)',
  };
  const PALETTE_ORDER = ['purple', 'blue', 'green', 'orange', 'yellow', 'red', 'indigo', 'magenta', 'teal', 'forest', 'brown', 'rose'];

  // Pastilla de plegado: separación desde el borde del nodo y radio.
  const BADGE = { gap: 8, r: 10 };

  function childrenIndex(doc) {
    const kids = {};
    for (const n of Object.values(doc.nodes)) {
      if (n.parentId == null) continue;
      (kids[n.parentId] || (kids[n.parentId] = [])).push(n);
    }
    const ids = {};
    for (const k in kids) ids[k] = kids[k].sort((a, b) => a.order - b.order).map((n) => n.id);
    return ids;
  }

  // size(id, level) -> { w, h } del nodo ya dibujado (incluye el relleno).
  function computeLayout(doc, size) {
    const vertical = doc.settings.layout === 'vertical';
    const lines = doc.settings.lines || 'curvy';
    const kids = childrenIndex(doc);
    const boxes = {};
    const outerSides = vertical ? ['bottom', 'top'] : ['right', 'left'];

    (function prep(id, level, inherited) {
      const n = doc.nodes[id];
      const style = n.style || {};
      const color = style.color || inherited.color || null;
      let side = null;
      if (level > 0) {
        side = style.side || inherited.side || outerSides[0];
        if (!outerSides.includes(side)) side = outerSides[0];
      }
      const b = {
        id, level, color, side,
        st: levelStyle(level),
        dash: style.dash != null ? !!style.dash : !!inherited.dash,
        collapsed: !!style.collapsed,
        children: kids[id] || [],
        parentId: n.parentId,
        hidden: 0,
        visible: false,
      };
      boxes[id] = b;
      for (const c of b.children) {
        prep(c, level + 1, { color, side, dash: b.dash });
        b.hidden += 1 + boxes[c].hidden;
      }
    })(doc.rootId, 0, {});

    const visibleKids = (b) => (b.collapsed ? [] : b.children);
    (function mark(id) {
      const b = boxes[id];
      b.visible = true;
      const s = size(id, b.level);
      b.w = s.w;
      b.h = s.h;
      visibleKids(b).forEach(mark);
    })(doc.rootId);

    // Extensión del subárbol en el eje en que se apilan los hermanos.
    const ext = {};
    const extent = (id) => {
      const b = boxes[id];
      const own = vertical ? b.w : b.h;
      const ks = visibleKids(b);
      if (!ks.length) return (ext[id] = own);
      let sum = 0;
      ks.forEach((c, i) => { sum += extent(c) + (i ? siblingGap(b.level + 1) : 0); });
      return (ext[id] = Math.max(own, sum));
    };
    const sumExtent = (ids, level) => ids.reduce((s, c, i) => s + ext[c] + (i ? siblingGap(level) : 0), 0);

    // dir: +1 hacia la derecha/abajo, -1 hacia la izquierda/arriba.
    function place(id, main, cross, dir) {
      const b = boxes[id];
      b.dir = dir;
      if (vertical) { b.x = cross - b.w / 2; b.y = dir > 0 ? main : main - b.h; }
      else { b.x = dir > 0 ? main : main - b.w; b.y = cross - b.h / 2; }
      placeChildren(b, visibleKids(b), dir);
    }

    function placeChildren(b, ids, dir) {
      if (!ids.length) return;
      const level = b.level + 1;
      const main = vertical
        ? (dir > 0 ? b.y + b.h + PARENT_GAP : b.y - PARENT_GAP)
        : (dir > 0 ? b.x + b.w + PARENT_GAP : b.x - PARENT_GAP);
      const center = vertical ? b.x + b.w / 2 : b.y + b.h / 2;
      let start = center - sumExtent(ids, level) / 2;
      for (const c of ids) {
        place(c, main, start + ext[c] / 2, dir);
        start += ext[c] + siblingGap(level);
      }
    }

    const rootBox = boxes[doc.rootId];
    rootBox.x = -rootBox.w / 2;
    rootBox.y = -rootBox.h / 2;
    rootBox.dir = 1;
    const top = visibleKids(rootBox);
    top.forEach(extent);
    const groups = [
      { dir: 1, ids: top.filter((c) => boxes[c].side === outerSides[0]) },
      { dir: -1, ids: top.filter((c) => boxes[c].side === outerSides[1]) },
    ];
    for (const g of groups) placeChildren(rootBox, g.ids, g.dir);

    const connectors = [];
    for (const g of groups) {
      g.ids.forEach((id, i) => {
        connectors.push(connector(rootBox, boxes[id], lines, vertical, { index: i, count: g.ids.length }));
      });
    }
    for (const b of Object.values(boxes)) {
      if (!b.visible || b.level < 2) continue;
      connectors.push(connector(boxes[b.parentId], b, lines, vertical, null));
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of Object.values(boxes)) {
      if (!b.visible) continue;
      const extra = b.collapsed && b.children.length ? BADGE.gap + BADGE.r * 2 + 16 : 0;
      const ex = vertical ? 0 : extra, ey = vertical ? extra : 0;
      minX = Math.min(minX, b.x - (b.dir < 0 ? ex : 0));
      maxX = Math.max(maxX, b.x + b.w + (b.dir > 0 ? ex : 0));
      minY = Math.min(minY, b.y - (b.dir < 0 ? ey : 0));
      maxY = Math.max(maxY, b.y + b.h + (b.dir > 0 ? ey : 0));
    }
    return { boxes, connectors, vertical, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
  }

  // Punto de anclaje en el eje cruzado: el centro del nodo. Con una sola línea coincide con el centro de esa línea; con
  // varias, la rama llega a la mitad del texto (si no, un hijo único de varias líneas, que se centra con su padre,
  // recibiría la línea torcida hacia su primera línea).
  const anchorCross = (b, vertical) => (vertical ? b.x + b.w / 2 : b.y + b.h / 2);
  // Borde exterior del nodo en el eje principal.
  const outerEdge = (b, vertical) => (vertical ? (b.dir > 0 ? b.y + b.h : b.y) : (b.dir > 0 ? b.x + b.w : b.x));
  const innerEdge = (b, vertical) => (vertical ? (b.dir > 0 ? b.y : b.y + b.h) : (b.dir > 0 ? b.x : b.x + b.w));

  function connector(p, c, lines, vertical, spread) {
    const dir = c.dir;
    const ea = innerEdge(c, vertical);
    const eb = anchorCross(c, vertical);
    let sa, sb, d;
    if (p.level === 0) {
      const pc = vertical ? p.x + p.w / 2 : p.y + p.h / 2;
      const half = (vertical ? p.w : p.h) / 2;
      const edge = vertical ? (dir > 0 ? p.y + p.h : p.y) : (dir > 0 ? p.x + p.w : p.x);
      if (lines === 'angular') {
        sb = pc;
        sa = edge - dir * 16.3;
        d = path(vertical, sa, sb, ['V', eb], ['H', ea]);
      } else {
        // Arranques repartidos dentro de la raíz (separación medida: mitad del alto / nº de hijos).
        const step = half / spread.count;
        sb = pc + (spread.index - (spread.count - 1) / 2) * step;
        sa = edge - dir * (40 + 0.309 * Math.abs(eb - sb));
        const w = Math.abs(ea - sa);
        const k = Math.min(80, w * 0.6);
        const k2 = Math.min(k, w - k);
        d = curve(vertical, sa, sb, sa + dir * k, sb, sa + dir * k2, eb, ea, eb);
      }
    } else {
      sa = outerEdge(p, vertical);
      sb = anchorCross(p, vertical);
      const w = Math.abs(ea - sa);
      if (lines === 'angular') {
        const mid = sa + dir * w / 2;
        d = path(vertical, sa, sb, ['H', mid], ['V', eb], ['H', ea]);
      } else {
        const stub = Math.min(10, w / 4);
        const a0 = sa + dir * stub, a1 = ea - dir * stub;
        const L = Math.abs(a1 - a0);
        const k = Math.min(40, L * 0.55);
        d = `${move(vertical, sa, sb)}${line(vertical, a0, sb)}` +
          curveTail(vertical, a0 + dir * k, sb, a1 - dir * k, eb, a1, eb) +
          line(vertical, ea, eb);
      }
    }
    return { id: c.id, color: c.color, dash: c.dash, width: STROKE, d };
  }

  // Helpers que escriben coordenadas (a = eje principal, b = eje cruzado) en x,y.
  const xy = (vertical, a, b) => (vertical ? `${r(b)},${r(a)}` : `${r(a)},${r(b)}`);
  const r = (v) => Math.round(v * 100) / 100;
  const move = (v, a, b) => `M${xy(v, a, b)}`;
  const line = (v, a, b) => `L${xy(v, a, b)}`;
  const curve = (v, a0, b0, a1, b1, a2, b2, a3, b3) => `${move(v, a0, b0)}C${xy(v, a1, b1)} ${xy(v, a2, b2)} ${xy(v, a3, b3)}`;
  const curveTail = (v, a1, b1, a2, b2, a3, b3) => `C${xy(v, a1, b1)} ${xy(v, a2, b2)} ${xy(v, a3, b3)}`;
  // Segmentos ortogonales: 'H' avanza en el eje principal, 'V' en el cruzado.
  function path(vertical, sa, sb, ...segs) {
    let a = sa, b = sb, out = move(vertical, a, b);
    for (const [kind, val] of segs) {
      if (kind === 'H') a = val; else b = val;
      out += line(vertical, a, b);
    }
    return out;
  }

  const api = { computeLayout, childrenIndex, levelStyle, LEVELS, PALETTE, PALETTE_ORDER, BADGE, PARENT_GAP, anchorCross, outerEdge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
