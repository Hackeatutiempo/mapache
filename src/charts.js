// Gráficos en SVG a partir de los datos de una tabla.
// Reglas de la guía de visualización: paleta categórica validada (orden fijo, nunca cíclica),
// un solo eje Y, barras ≤ 24 px con extremo redondeado de 4 px, líneas de 2 px, áreas al ~10 %,
// separación de 2 px del color de fondo entre marcas, rejilla fina y discreta, leyenda con ≥ 2 series
// y el texto siempre en tinta (nunca del color de la serie).
(function (root) {
  'use strict';
  const t = root.MMI18n.t;

  // Paletas por tema, validadas con scripts/validate_palette.js contra el fondo de cada uno:
  // oscuro contra #111821, claro contra #ffffff (categórica: todas las comprobaciones; aviso de contraste en
  // tres pasos claros, cubierto por la ayuda al pasar el ratón y la tabla enlazada). Mismo orden de tonos.
  const THEMES = {
    dark: {
      CAT: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
      // Escala secuencial azul: de cerca del fondo (poco) a lejos (mucho). Ordinal validada para el embudo.
      SEQ: ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'],
      ORD: ['#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'],
      POS: '#3987e5', NEG: '#e66767', TOTAL: '#6b7685',
      INK: { primary: '#eef1f5', secondary: '#c3c9d2', muted: '#8d99a8', grid: '#222b36', axis: '#33404f', surface: '#151d27' },
    },
    light: {
      CAT: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
      SEQ: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95'],
      ORD: ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef'],
      POS: '#2a78d6', NEG: '#e34948', TOTAL: '#898781',
      INK: { primary: '#1f2733', secondary: '#52514e', muted: '#898781', grid: '#e7e9ec', axis: '#c5cad1', surface: '#ffffff' },
    },
  };
  // Se cambian en su sitio para que todo lo que los usa vea el tema actual.
  const CAT = [...THEMES.dark.CAT], SEQ = [...THEMES.dark.SEQ], ORD = [...THEMES.dark.ORD], INK = { ...THEMES.dark.INK };
  let POS = THEMES.dark.POS, NEG = THEMES.dark.NEG, TOTAL = THEMES.dark.TOTAL;
  function setTheme(name) {
    const t = THEMES[name] || THEMES.dark;
    CAT.splice(0, CAT.length, ...t.CAT);
    SEQ.splice(0, SEQ.length, ...t.SEQ);
    ORD.splice(0, ORD.length, ...t.ORD);
    Object.assign(INK, t.INK);
    ({ POS, NEG, TOTAL } = t);
  }
  const FONT = '"Segoe UI", system-ui, sans-serif';

  const KINDS = [
    ['column', t('Columnas')], ['column-stacked', t('Columnas apiladas')], ['column-100', t('Columnas 100 %')],
    ['bar', t('Barras')], ['bar-stacked', t('Barras apiladas')],
    ['line', t('Líneas')], ['area', t('Área')], ['area-stacked', t('Área apilada')],
    ['pie', t('Circular')], ['donut', t('Anillo')],
    ['scatter', t('Dispersión')], ['bubble', t('Burbujas')], ['radar', t('Radar')],
    ['funnel', t('Embudo')], ['heatmap', t('Mapa de calor')], ['waterfall', t('Cascada')], ['stat', t('Cifra destacada')],
  ];
  // Límite de series por forma: 8 en general; 3 donde todas las parejas se ven juntas (puntos, radar).
  const SERIES_CAP = { scatter: 3, bubble: 3, radar: 3 };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // Cifras con el formato del idioma de la interfaz (1.234,5 en español, 1,234.5 en inglés).
  const LOCALE = root.MMI18n.locale;
  const nf = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
  const nfc = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
  let compactMode = false;
  const fmt = (v) => (v == null || Number.isNaN(v) ? '—' : compactMode ? nfc.format(v) : nf.format(v));
  const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
  const pc = (v) => t('{n} %', { n: v }); // porcentaje: «45 %» en español, «45%» en inglés
  const r1 = (v) => Math.round(v * 10) / 10;

  // Números escritos a la española o a la inglesa: 1.234,5 · 1,234.5 · 12,5 · 45 % · 1.200 €.
  function parseNumber(raw) {
    if (raw == null) return null;
    let s = String(raw).replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '').replace(/[€$£%]/g, '');
    if (!s || !/[0-9]/.test(s)) return null;
    const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
    s = s.replace(/[()+-]/g, '');
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    if (lastDot > -1 && lastComma > -1) {
      s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma > -1) {
      s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    if (!/^\d*\.?\d+$/.test(s)) return null;
    const v = parseFloat(s);
    return neg ? -v : v;
  }

  function niceTicks(min, max, count = 5) {
    if (min === max) { max = min + 1; min = Math.min(0, min); }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { ticks, min: lo, max: hi };
  }

  const textW = (s, size = 11) => String(s).length * size * 0.58;
  const text = (x, y, s, { size = 11, color = INK.muted, anchor = 'start', weight = 400, extra = '' } = {}) =>
    `<text x="${r1(x)}" y="${r1(y)}" font-family='${FONT}' font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`;
  // Datos para el tooltip: líneas "color|etiqueta|valor".
  const tt = (title, rows) => `data-tt="${esc([title, ...rows.map(([c, l, v]) => `${c}|${l}|${v}`)].join('\n'))}"`;

  // Rectángulo con extremo de datos redondeado (4 px) y base recta.
  function barPath(x, y, w, h, dir) {
    const rr = Math.min(4, w / 2, Math.abs(h) / 2);
    if (h <= 0.5) return `M${r1(x)},${r1(y)}h${r1(w)}`;
    if (dir === 'up') return `M${r1(x)},${r1(y + h)}V${r1(y + rr)}Q${r1(x)},${r1(y)} ${r1(x + rr)},${r1(y)}H${r1(x + w - rr)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + rr)}V${r1(y + h)}Z`;
    if (dir === 'down') return `M${r1(x)},${r1(y)}V${r1(y + h - rr)}Q${r1(x)},${r1(y + h)} ${r1(x + rr)},${r1(y + h)}H${r1(x + w - rr)}Q${r1(x + w)},${r1(y + h)} ${r1(x + w)},${r1(y + h - rr)}V${r1(y)}Z`;
    if (dir === 'right') return `M${r1(x)},${r1(y)}H${r1(x + w - rr)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + rr)}V${r1(y + h - rr)}Q${r1(x + w)},${r1(y + h)} ${r1(x + w - rr)},${r1(y + h)}H${r1(x)}Z`;
    return `M${r1(x + w)},${r1(y)}H${r1(x + rr)}Q${r1(x)},${r1(y)} ${r1(x)},${r1(y + rr)}V${r1(y + h - rr)}Q${r1(x)},${r1(y + h)} ${r1(x + rr)},${r1(y + h)}H${r1(x + w)}Z`;
  }
  const rectPath = (x, y, w, h) => `M${r1(x)},${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`;

  // Leyenda en una o varias filas. Devuelve { svg, height }.
  function legend(items, x0, y0, maxW, key = 'square') {
    let x = x0, y = y0;
    const parts = [];
    for (const [color, label] of items) {
      const w = 16 + textW(label, 12) + 16;
      if (x + w > x0 + maxW && x > x0) { x = x0; y += 18; }
      parts.push(key === 'line'
        ? `<path d="M${r1(x)},${r1(y - 4)}h12" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
        : `<rect x="${r1(x)}" y="${r1(y - 9)}" width="10" height="10" rx="2.5" fill="${color}"/>`);
      parts.push(text(x + 16, y, label, { size: 12, color: INK.secondary }));
      x += w;
    }
    return { svg: parts.join(''), height: items.length ? y - y0 + 18 : 0 };
  }

  // spec: { kind, title, showValues }; data: { labels: [], series: [{ name, values: [] }] }
  function render(spec, data, W, H) {
    const kind = spec.kind || 'column';
    const out = [`<rect width="${W}" height="${H}" rx="10" fill="${INK.surface}"/>`];
    let top = 16;
    const title = spec.title || '';
    if (title) { out.push(text(18, top + 14, title, { size: 15, color: INK.primary, weight: 600 })); top += 30; }

    const cap = SERIES_CAP[kind] || 8;
    const numeric = data.series.filter((s) => s.values.some((v) => v != null));
    const series = numeric.slice(0, cap);
    const dropped = numeric.length - series.length;
    if (!series.length || !data.labels.length) {
      out.push(text(W / 2, H / 2, t('Añade números a la tabla para ver el gráfico'), { anchor: 'middle', color: INK.muted, size: 13 }));
      return wrap(out, W, H);
    }
    compactMode = Math.max(0, ...series.flatMap((se) => se.values.filter((v) => v != null).map(Math.abs))) >= 10000;
    const color = (i) => CAT[i];
    const box = { x: 18, y: top, w: W - 36, h: H - top - 16 };
    const multi = series.length >= 2;
    const ctx = { spec, data, series, color, box, out, W, H, multi };

    const legendFor = (items, key) => {
      const lg = legend(items, box.x, box.y + 10, box.w, key);
      out.push(lg.svg);
      box.y += lg.height + 6;
      box.h -= lg.height + 6;
    };
    if (multi && !['pie', 'donut', 'scatter', 'bubble', 'funnel', 'heatmap', 'waterfall', 'stat'].includes(kind)) {
      legendFor(series.map((s, i) => [color(i), s.name]), ['line', 'area', 'area-stacked', 'radar'].includes(kind) ? 'line' : 'square');
    }
    if (dropped > 0) {
      out.push(text(W - 18, top - 2, t('+{n} series sin mostrar', { n: dropped }), { size: 11, anchor: 'end' }));
    }

    const fn = { column: cartesian, 'column-stacked': cartesian, 'column-100': cartesian, bar: cartesian, 'bar-stacked': cartesian,
      line: cartesian, area: cartesian, 'area-stacked': cartesian, pie, donut: pie, scatter, bubble: scatter, radar, funnel, heatmap, waterfall, stat }[kind] || cartesian;
    fn(ctx, kind, legendFor);
    return wrap(out, W, H);
  }

  const wrap = (out, W, H) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join('')}</svg>`;

  // ---------- Columnas, barras, líneas y áreas (un solo eje de valores) ----------
  function cartesian(ctx, kind) {
    const { data, series, color, box, out, spec } = ctx;
    const horizontal = kind.startsWith('bar');
    const stacked = kind.endsWith('stacked') || kind === 'column-100';
    const pct = kind === 'column-100';
    const isLine = kind === 'line' || kind.startsWith('area');
    const n = data.labels.length;

    // Valores (apilados o al 100 %).
    const totals = data.labels.map((_, i) => series.reduce((s, se) => s + Math.max(0, se.values[i] || 0), 0));
    const val = (si, i) => {
      const v = series[si].values[i];
      if (v == null) return null;
      return pct ? (totals[i] ? (Math.max(0, v) / totals[i]) * 100 : 0) : v;
    };
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      if (stacked) {
        let pos = 0, neg = 0;
        series.forEach((_, si) => { const v = val(si, i) || 0; if (v >= 0) pos += v; else neg += v; });
        hi = Math.max(hi, pos); lo = Math.min(lo, neg);
      } else series.forEach((_, si) => { const v = val(si, i); if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); } });
    }
    if (pct) { lo = 0; hi = 100; }
    const nt = niceTicks(lo, hi, 5);
    // Todas las marcas del eje con el mismo formato (si una es «20 mil», también «5 mil»).
    // Ejes y etiquetas comparten formato: si el eje llega a «10 mil», los valores también van en «mil».
    if (!pct && Math.max(Math.abs(nt.min), Math.abs(nt.max)) >= 10000) compactMode = true;
    const tickLabel = (v) => (pct ? pc(v) : fmt(v));

    // Márgenes para las etiquetas de los ejes.
    const yLabelW = Math.max(...nt.ticks.map((t) => textW(tickLabel(t)))) + 10;
    const catLabelW = Math.min(120, Math.max(...data.labels.map((l) => textW(l))) + 10);
    const plot = horizontal
      ? { x: box.x + catLabelW, y: box.y + 6, w: box.w - catLabelW - 24, h: box.h - 26 }
      : { x: box.x + yLabelW, y: box.y + 8, w: box.w - yLabelW - (isLine ? 56 : 8), h: box.h - 32 };
    if (plot.w < 40 || plot.h < 40) return;
    const scale = (v) => (horizontal
      ? plot.x + ((v - nt.min) / (nt.max - nt.min)) * plot.w
      : plot.y + plot.h - ((v - nt.min) / (nt.max - nt.min)) * plot.h);
    const base = scale(Math.max(nt.min, Math.min(0, nt.max)));

    // Rejilla y ejes: líneas finas, continuas y discretas.
    for (const t of nt.ticks) {
      const p = scale(t);
      if (horizontal) {
        out.push(`<path d="M${r1(p)},${r1(plot.y)}V${r1(plot.y + plot.h)}" stroke="${t === 0 ? INK.axis : INK.grid}" stroke-width="1"/>`);
        out.push(text(p, plot.y + plot.h + 16, tickLabel(t), { anchor: 'middle', extra: 'style="font-variant-numeric:tabular-nums"' }));
      } else {
        out.push(`<path d="M${r1(plot.x)},${r1(p)}H${r1(plot.x + plot.w)}" stroke="${t === 0 ? INK.axis : INK.grid}" stroke-width="1"/>`);
        out.push(text(plot.x - 8, p + 4, tickLabel(t), { anchor: 'end', extra: 'style="font-variant-numeric:tabular-nums"' }));
      }
    }

    const band = (horizontal ? plot.h : plot.w) / n;
    const center = (i) => (horizontal ? plot.y : plot.x) + band * (i + 0.5);
    // Etiquetas de categoría (se saltan si no caben).
    const every = horizontal ? Math.ceil(16 / band) : Math.ceil((Math.max(...data.labels.map((l) => textW(l))) + 8) / band);
    data.labels.forEach((l, i) => {
      if (i % Math.max(1, every)) return;
      if (horizontal) out.push(text(plot.x - 8, center(i) + 4, l.length > 18 ? `${l.slice(0, 17)}…` : l, { anchor: 'end', color: INK.secondary }));
      else out.push(text(center(i), plot.y + plot.h + 18, l.length > 14 ? `${l.slice(0, 13)}…` : l, { anchor: 'middle', color: INK.secondary }));
    });

    const tipRows = (i) => series.map((se, si) => [color(si), se.name, pct ? `${pc(nf.format(val(si, i) || 0))} (${fmt(se.values[i])})` : fmt(se.values[i])]);

    if (isLine) {
      const area = kind.startsWith('area');
      const cum = data.labels.map(() => 0);
      const pathsFill = [], pathsLine = [], dots = [];
      series.forEach((se, si) => {
        const pts = [];
        data.labels.forEach((_, i) => {
          const v = val(si, i);
          if (v == null) { pts.push(null); return; }
          const y0 = stacked ? cum[i] : 0;
          const y1 = stacked ? cum[i] + v : v;
          if (stacked) cum[i] = y1;
          pts.push([center(i), scale(y1), scale(y0)]);
        });
        const valid = pts.filter(Boolean);
        if (!valid.length) return;
        const d = valid.map(([x, y], k) => `${k ? 'L' : 'M'}${r1(x)},${r1(y)}`).join('');
        if (area) {
          const back = [...valid].reverse().map(([x, , y0]) => `L${r1(x)},${r1(y0)}`).join('');
          pathsFill.push(`<path d="${d}${back}Z" fill="${color(si)}" fill-opacity="${stacked ? 0.16 : 0.1}"/>`);
        }
        pathsLine.push(`<path d="${d}" fill="none" stroke="${color(si)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
        // Marca y valor solo en el último punto de cada serie (etiquetado selectivo).
        const [lx, ly] = valid[valid.length - 1];
        dots.push(`<circle cx="${r1(lx)}" cy="${r1(ly)}" r="4" fill="${color(si)}" stroke="${INK.surface}" stroke-width="2"/>`);
        if (series.length <= 4) dots.push(text(lx + 8, ly + 4, fmt(se.values[pts.lastIndexOf(valid[valid.length - 1])]), { color: INK.secondary }));
      });
      out.push(...pathsFill, ...pathsLine, ...dots);
      // Capa de lectura: banda por categoría con línea guía y tooltip con todas las series.
      data.labels.forEach((l, i) => {
        const x = center(i);
        out.push(`<g class="ch-band"><rect class="chart-hit" x="${r1(x - band / 2)}" y="${r1(plot.y)}" width="${r1(band)}" height="${r1(plot.h)}" fill="transparent" ${tt(l, tipRows(i))}/>` +
          `<path class="ch-guide" d="M${r1(x)},${r1(plot.y)}V${r1(plot.y + plot.h)}" stroke="${INK.muted}" stroke-width="1"/></g>`);
      });
      return;
    }

    // Columnas / barras: cada barra ≤ 24 px, 2 px de separación, extremo de datos redondeado.
    const groups = stacked ? 1 : series.length;
    const thick = Math.max(2, Math.min(24, (band * 0.72 - (groups - 1) * 2) / groups));
    const groupW = thick * groups + (groups - 1) * 2;
    const showValues = spec.showValues ?? (series.length === 1 && n <= 12);
    for (let i = 0; i < n; i++) {
      const start = center(i) - groupW / 2;
      let pos = 0, neg = 0;
      const segs = [];
      series.forEach((se, si) => {
        const v = val(si, i);
        if (v == null) return;
        let a, b;
        if (stacked) { if (v >= 0) { a = pos; b = pos + v; pos = b; } else { a = neg; b = neg + v; neg = b; } }
        else { a = 0; b = v; }
        segs.push({ si, v, a, b, off: stacked ? 0 : si * (thick + 2) });
      });
      // Con apilado, solo el segmento final de cada lado lleva el extremo redondeado.
      const lastPos = [...segs].reverse().find((s) => s.v >= 0);
      const lastNeg = [...segs].reverse().find((s) => s.v < 0);
      for (const sg of segs) {
        const p0 = scale(sg.a), p1 = scale(sg.b);
        const end = !stacked || sg === lastPos || sg === lastNeg;
        const gap = stacked && !end ? 2 : 0; // separación de 2 px entre segmentos
        let d;
        if (horizontal) {
          const y = start + sg.off;
          const x0 = Math.min(p0, p1), w = Math.max(0, Math.abs(p1 - p0) - gap);
          const x = sg.v >= 0 ? x0 : x0 + gap;
          d = end ? barPath(x, y, w, thick, sg.v >= 0 ? 'right' : 'left') : rectPath(x, y, w, thick);
        } else {
          const x = start + sg.off;
          const y0 = Math.min(p0, p1), h = Math.max(0, Math.abs(p1 - p0) - gap);
          const y = sg.v >= 0 ? y0 + gap : y0;
          d = end ? barPath(x, y, thick, h, sg.v >= 0 ? 'up' : 'down') : rectPath(x, y, thick, h);
        }
        out.push(`<path d="${d}" fill="${color(sg.si)}"/>`);
        if (showValues && !stacked) {
          const label = pct ? pc(nf.format(sg.v)) : fmt(series[sg.si].values[i]);
          if (horizontal) out.push(text(Math.max(p0, p1) + 6, start + sg.off + thick / 2 + 4, label, { color: INK.secondary }));
          else out.push(text(start + sg.off + thick / 2, Math.min(p0, p1) - 6, label, { anchor: 'middle', color: INK.secondary }));
        }
      }
      // Zona de lectura de toda la categoría (más grande que la marca).
      const hb = horizontal
        ? `x="${r1(plot.x)}" y="${r1(center(i) - band / 2)}" width="${r1(plot.w)}" height="${r1(band)}"`
        : `x="${r1(center(i) - band / 2)}" y="${r1(plot.y)}" width="${r1(band)}" height="${r1(plot.h)}"`;
      out.push(`<rect class="chart-hit ch-cat" ${hb} fill="transparent" ${tt(data.labels[i], tipRows(i))}/>`);
    }
    void base;
  }

  // ---------- Circular y anillo: parte de un todo, como mucho 6 porciones ----------
  function pie(ctx, kind, legendFor) {
    const { data, series, box, out } = ctx;
    const se = series[0];
    let items = data.labels.map((l, i) => [l, Math.max(0, se.values[i] || 0)]).filter(([, v]) => v > 0);
    items.sort((a, b) => b[1] - a[1]);
    if (items.length > 6) {
      const rest = items.slice(5).reduce((s, [, v]) => s + v, 0);
      items = [...items.slice(0, 5), [t('Otros'), rest]];
    }
    const total = items.reduce((s, [, v]) => s + v, 0);
    if (!total) return;
    legendFor(items.map(([l, v], i) => [CAT[i], `${l} · ${pc(nf1.format((v / total) * 100))}`]), 'square');
    const R = Math.max(20, Math.min(box.w, box.h) / 2 - 8);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2 + 2;
    const inner = kind === 'donut' ? R * 0.6 : 0;
    let a0 = -Math.PI / 2;
    items.forEach(([l, v], i) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rad) => `${r1(cx + rad * Math.cos(a))},${r1(cy + rad * Math.sin(a))}`;
      const d = items.length === 1
        ? `M${cx - R},${cy}A${R},${R} 0 1 1 ${cx + R},${cy}A${R},${R} 0 1 1 ${cx - R},${cy}Z`
        : inner
          ? `M${p(a0, R)}A${R},${R} 0 ${big} 1 ${p(a1, R)}L${p(a1, inner)}A${inner},${inner} 0 ${big} 0 ${p(a0, inner)}Z`
          : `M${cx},${cy}L${p(a0, R)}A${R},${R} 0 ${big} 1 ${p(a1, R)}Z`;
      // El trazo del color de fondo es la separación de 2 px entre porciones.
      out.push(`<path class="chart-hit" d="${d}" fill="${CAT[i]}" stroke="${INK.surface}" stroke-width="2" ${tt(l, [[CAT[i], se.name, `${fmt(v)} · ${pc(nf1.format((v / total) * 100))}`]])}/>`);
      a0 = a1;
    });
    if (inner) {
      out.push(text(cx, cy + 2, fmt(total), { anchor: 'middle', size: Math.max(14, inner * 0.38), color: INK.primary, weight: 600 }));
      out.push(text(cx, cy + 20, t('Total'), { anchor: 'middle', size: 11 }));
    }
  }

  // ---------- Dispersión y burbujas: X = 1.ª serie, Y = 2.ª, tamaño = 3.ª ----------
  function scatter(ctx, kind) {
    const { data, series, box, out } = ctx;
    if (series.length < 2) {
      out.push(text(box.x + box.w / 2, box.y + box.h / 2, t('Necesita dos columnas numéricas (X e Y)'), { anchor: 'middle', size: 12 }));
      return;
    }
    const [sx, sy, ss] = series;
    const pts = data.labels.map((l, i) => [l, sx.values[i], sy.values[i], ss ? ss.values[i] : null]).filter(([, x, y]) => x != null && y != null);
    const tx = niceTicks(Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1])), 5);
    const ty = niceTicks(Math.min(...pts.map((p) => p[2])), Math.max(...pts.map((p) => p[2])), 5);
    const yw = Math.max(...ty.ticks.map((t) => textW(fmt(t)))) + 10;
    const plot = { x: box.x + yw, y: box.y + 8, w: box.w - yw - 12, h: box.h - 46 };
    const X = (v) => plot.x + ((v - tx.min) / (tx.max - tx.min)) * plot.w;
    const Y = (v) => plot.y + plot.h - ((v - ty.min) / (ty.max - ty.min)) * plot.h;
    for (const t of ty.ticks) { out.push(`<path d="M${r1(plot.x)},${r1(Y(t))}H${r1(plot.x + plot.w)}" stroke="${INK.grid}"/>`, text(plot.x - 8, Y(t) + 4, fmt(t), { anchor: 'end' })); }
    for (const t of tx.ticks) { out.push(`<path d="M${r1(X(t))},${r1(plot.y)}V${r1(plot.y + plot.h)}" stroke="${INK.grid}"/>`, text(X(t), plot.y + plot.h + 16, fmt(t), { anchor: 'middle' })); }
    out.push(text(plot.x + plot.w, plot.y + plot.h + 32, sx.name, { anchor: 'end', color: INK.secondary }));
    out.push(text(plot.x, plot.y - 2, sy.name, { color: INK.secondary }));
    const maxS = Math.max(1, ...pts.map((p) => Math.abs(p[3] || 0)));
    for (const [l, x, y, s] of pts) {
      const rad = kind === 'bubble' && s != null ? 4 + Math.sqrt(Math.abs(s) / maxS) * 22 : 5;
      const rows = [[CAT[0], sx.name, fmt(x)], [CAT[0], sy.name, fmt(y)]];
      if (kind === 'bubble' && ss) rows.push([CAT[0], ss.name, fmt(s)]);
      out.push(`<circle cx="${r1(X(x))}" cy="${r1(Y(y))}" r="${r1(rad)}" fill="${CAT[0]}" fill-opacity="${kind === 'bubble' ? 0.55 : 1}" stroke="${INK.surface}" stroke-width="2"/>`);
      out.push(`<circle class="chart-hit" cx="${r1(X(x))}" cy="${r1(Y(y))}" r="${r1(Math.max(12, rad + 2))}" fill="transparent" ${tt(l, rows)}/>`);
    }
  }

  // ---------- Radar: categorías como ejes, como mucho 3 series ----------
  function radar(ctx) {
    const { data, series, color, box, out } = ctx;
    const n = data.labels.length;
    if (n < 3) { out.push(text(box.x + box.w / 2, box.y + box.h / 2, t('Necesita al menos 3 filas'), { anchor: 'middle', size: 12 })); return; }
    const max = niceTicks(0, Math.max(...series.flatMap((s) => s.values.filter((v) => v != null))), 4);
    const R = Math.min(box.w, box.h) / 2 - 34;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2 + 4;
    const pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; const rr = (v / max.max) * R; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
    for (const t of max.ticks.slice(1)) out.push(`<path d="M${data.labels.map((_, i) => pt(i, t).map(r1).join(',')).join('L')}Z" fill="none" stroke="${INK.grid}"/>`);
    data.labels.forEach((l, i) => {
      const [x, y] = pt(i, max.max);
      out.push(`<path d="M${cx},${cy}L${r1(x)},${r1(y)}" stroke="${INK.grid}"/>`);
      const [lx, ly] = pt(i, max.max * 1.13);
      out.push(text(lx, ly + 4, l.length > 14 ? `${l.slice(0, 13)}…` : l, { anchor: Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end', color: INK.secondary }));
    });
    series.forEach((se, si) => {
      const pts = data.labels.map((_, i) => pt(i, se.values[i] || 0));
      out.push(`<path d="M${pts.map((p) => p.map(r1).join(',')).join('L')}Z" fill="${color(si)}" fill-opacity="0.1" stroke="${color(si)}" stroke-width="2" stroke-linejoin="round"/>`);
      pts.forEach(([x, y], i) => {
        out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="4" fill="${color(si)}" stroke="${INK.surface}" stroke-width="2"/>`);
        out.push(`<circle class="chart-hit" cx="${r1(x)}" cy="${r1(y)}" r="12" fill="transparent" ${tt(data.labels[i], series.map((s, k) => [color(k), s.name, fmt(s.values[i])]))}/>`);
      });
    });
  }

  // ---------- Embudo: etapas ordenadas con escala ordinal de un solo azul ----------
  function funnel(ctx) {
    const { data, series, box, out } = ctx;
    const se = series[0];
    const items = data.labels.map((l, i) => [l, se.values[i] || 0]);
    const max = Math.max(...items.map(([, v]) => v), 1);
    const first = items[0] ? items[0][1] : 0;
    const h = Math.min(44, (box.h - 8) / items.length - 4);
    const labelW = Math.min(150, Math.max(...items.map(([l]) => textW(l, 12))) + 12);
    const area = { x: box.x + labelW, w: box.w - labelW - 120 };
    items.forEach(([l, v], i) => {
      const w = Math.max(4, (v / max) * area.w);
      const x = area.x + (area.w - w) / 2, y = box.y + 6 + i * (h + 4);
      const c = ORD[Math.round((i / Math.max(1, items.length - 1)) * (ORD.length - 1))];
      out.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="4" fill="${c}"/>`);
      out.push(text(box.x + labelW - 10, y + h / 2 + 4, l, { anchor: 'end', color: INK.secondary, size: 12 }));
      out.push(text(area.x + area.w + 10, y + h / 2 + 4, `${fmt(v)}${first ? ` · ${pc(Math.round((v / first) * 100))}` : ''}`, { color: INK.secondary }));
      out.push(`<rect class="chart-hit" x="${r1(box.x)}" y="${r1(y)}" width="${r1(box.w)}" height="${r1(h)}" fill="transparent" ${tt(l, [[c, se.name, fmt(v)], [c, t('Respecto a la 1.ª etapa'), first ? pc(nf.format((v / first) * 100)) : '—']])}/>`);
    });
  }

  // ---------- Mapa de calor: filas × series con escala secuencial ----------
  function heatmap(ctx) {
    const { data, series, box, out } = ctx;
    const all = series.flatMap((s) => s.values.filter((v) => v != null));
    const lo = Math.min(...all), hi = Math.max(...all);
    const labelW = Math.min(130, Math.max(...data.labels.map((l) => textW(l))) + 12);
    const cols = series.length, rows = data.labels.length;
    const cw = (box.w - labelW) / cols, ch = Math.min(36, (box.h - 44) / rows);
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
    series.forEach((se, c) => out.push(text(box.x + labelW + cw * (c + 0.5), box.y + 12, se.name.length > 12 ? `${se.name.slice(0, 11)}…` : se.name, { anchor: 'middle', color: INK.secondary })));
    data.labels.forEach((l, r) => {
      const y = box.y + 20 + r * ch;
      out.push(text(box.x + labelW - 8, y + ch / 2 + 4, l.length > 16 ? `${l.slice(0, 15)}…` : l, { anchor: 'end', color: INK.secondary }));
      series.forEach((se, c) => {
        const v = se.values[r];
        const x = box.x + labelW + c * cw;
        const t = v == null || hi === lo ? 0.5 : (v - lo) / (hi - lo);
        const fill = v == null ? INK.grid : SEQ[Math.round(t * (SEQ.length - 1))];
        // Separación de 2 px entre celdas; el texto elige tinta clara u oscura según el fondo.
        out.push(`<rect x="${r1(x + 1)}" y="${r1(y + 1)}" width="${r1(cw - 2)}" height="${r1(ch - 2)}" rx="3" fill="${fill}"/>`);
        if (cw > 34 && ch > 16 && v != null) out.push(text(x + cw / 2, y + ch / 2 + 4, fmt(v), { anchor: 'middle', color: lum(fill) > 0.55 ? '#0b0b0b' : '#ffffff' }));
        out.push(`<rect class="chart-hit" x="${r1(x)}" y="${r1(y)}" width="${r1(cw)}" height="${r1(ch)}" fill="transparent" ${tt(l, [[fill, se.name, fmt(v)]])}/>`);
      });
    });
    // Escala del color.
    const ly = box.y + 24 + rows * ch, lw = Math.min(180, box.w - labelW);
    SEQ.forEach((c, i) => out.push(`<rect x="${r1(box.x + labelW + (i * lw) / SEQ.length)}" y="${r1(ly)}" width="${r1(lw / SEQ.length)}" height="8" fill="${c}"/>`));
    out.push(text(box.x + labelW, ly + 22, fmt(lo)), text(box.x + labelW + lw, ly + 22, fmt(hi), { anchor: 'end' }));
  }

  // ---------- Cascada: cambios positivos y negativos hasta el total ----------
  function waterfall(ctx) {
    const { data, series, box, out } = ctx;
    const se = series[0];
    const steps = data.labels.map((l, i) => [l, se.values[i] || 0]);
    let run = 0;
    const bars = steps.map(([l, v]) => { const a = run; run += v; return { l, v, a, b: run }; });
    bars.push({ l: t('Total'), v: run, a: 0, b: run, total: true });
    const nt = niceTicks(Math.min(0, ...bars.map((b) => Math.min(b.a, b.b))), Math.max(...bars.map((b) => Math.max(b.a, b.b))), 5);
    const yw = Math.max(...nt.ticks.map((t) => textW(fmt(t)))) + 10;
    const plot = { x: box.x + yw, y: box.y + 8, w: box.w - yw - 8, h: box.h - 50 };
    const Y = (v) => plot.y + plot.h - ((v - nt.min) / (nt.max - nt.min)) * plot.h;
    for (const t of nt.ticks) out.push(`<path d="M${r1(plot.x)},${r1(Y(t))}H${r1(plot.x + plot.w)}" stroke="${t === 0 ? INK.axis : INK.grid}"/>`, text(plot.x - 8, Y(t) + 4, fmt(t), { anchor: 'end' }));
    const band = plot.w / bars.length, thick = Math.min(24, band * 0.7);
    const lg = legend([[POS, t('Sube')], [NEG, t('Baja')], [TOTAL, t('Total')]], box.x, box.y + box.h - 4, box.w);
    out.push(lg.svg);
    bars.forEach((b, i) => {
      const x = plot.x + band * (i + 0.5) - thick / 2;
      const y0 = Y(Math.max(b.a, b.b)), h = Math.abs(Y(b.a) - Y(b.b));
      const c = b.total ? TOTAL : b.v >= 0 ? POS : NEG;
      out.push(`<path d="${barPath(x, y0, thick, Math.max(1, h), b.v >= 0 || b.total ? 'up' : 'down')}" fill="${c}"/>`);
      if (i < bars.length - 1) out.push(`<path d="M${r1(x + thick)},${r1(Y(b.b))}h${r1(band - thick)}" stroke="${INK.axis}"/>`);
      out.push(text(x + thick / 2, plot.y + plot.h + 16, b.l.length > 10 ? `${b.l.slice(0, 9)}…` : b.l, { anchor: 'middle', color: INK.secondary }));
      out.push(`<rect class="chart-hit" x="${r1(plot.x + band * i)}" y="${r1(plot.y)}" width="${r1(band)}" height="${r1(plot.h)}" fill="transparent" ${tt(b.l, [[c, b.total ? t('Total') : t('Cambio'), fmt(b.v)], [c, t('Acumulado'), fmt(b.b)]])}/>`);
    });
  }

  // ---------- Cifra destacada: el número es el gráfico ----------
  function stat(ctx) {
    const { series, box, out } = ctx;
    const se = series[0];
    const vals = se.values.filter((v) => v != null);
    const total = vals.reduce((s, v) => s + v, 0);
    out.push(text(box.x, box.y + 18, t('Total de {name}', { name: se.name }), { size: 13, color: INK.secondary }));
    out.push(text(box.x, box.y + 18 + Math.min(64, box.h * 0.4), fmt(total), { size: Math.min(56, Math.max(28, box.h * 0.32)), color: INK.primary, weight: 600 }));
    if (vals.length >= 2) {
      const sp = { x: box.x, y: box.y + box.h * 0.62, w: box.w, h: box.h * 0.32 };
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const P = (v, i) => [sp.x + (i / (vals.length - 1)) * sp.w, sp.y + sp.h - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * sp.h];
      out.push(`<path d="${vals.map((v, i) => `${i ? 'L' : 'M'}${P(v, i).map(r1).join(',')}`).join('')}" fill="none" stroke="${INK.muted}" stroke-width="2" stroke-linejoin="round"/>`);
      const [lx, ly] = P(vals[vals.length - 1], vals.length - 1);
      out.push(`<circle cx="${r1(lx)}" cy="${r1(ly)}" r="4" fill="${CAT[0]}" stroke="${INK.surface}" stroke-width="2"/>`);
    }
  }

  // Miniaturas para el selector de tipo.
  function thumb(kind) {
    const s = (body) => `<svg viewBox="0 0 28 22" width="28" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    const T = {
      column: '<path d="M5 19V11M11 19V5M17 19V9M23 19V14"/>',
      'column-stacked': '<path d="M6 19v-5M6 12V8M14 19v-7M14 10V4M22 19v-4M22 13v-3"/>',
      'column-100': '<path d="M6 19v-8M6 9V3M14 19v-5M14 12V3M22 19v-10M22 7V3"/>',
      bar: '<path d="M3 5h12M3 10h20M3 15h8M3 19h15"/>',
      'bar-stacked': '<path d="M3 6h8M13 6h6M3 12h12M17 12h6M3 18h5M10 18h7"/>',
      line: '<path d="M3 17l6-6 5 4 10-10"/>',
      area: '<path d="M3 18l6-7 5 4 10-9v12z" fill="currentColor" fill-opacity=".25"/>',
      'area-stacked': '<path d="M3 19l6-5 6 3 10-6v8z" fill="currentColor" fill-opacity=".25"/><path d="M3 13l6-5 6 3 10-7"/>',
      pie: '<circle cx="14" cy="11" r="8"/><path d="M14 3v8h8"/>',
      donut: '<circle cx="14" cy="11" r="8"/><circle cx="14" cy="11" r="4"/><path d="M14 3v4"/>',
      scatter: '<circle cx="6" cy="16" r="1.5"/><circle cx="11" cy="9" r="1.5"/><circle cx="16" cy="13" r="1.5"/><circle cx="21" cy="6" r="1.5"/><circle cx="23" cy="15" r="1.5"/>',
      bubble: '<circle cx="8" cy="14" r="4"/><circle cx="17" cy="8" r="3"/><circle cx="21" cy="16" r="2"/>',
      radar: '<path d="M14 2l9 7-3 10H8L5 9z"/><path d="M14 6l5 4-2 6h-6l-2-6z"/>',
      funnel: '<path d="M3 4h22M7 9h14M10 14h8M12 19h4"/>',
      heatmap: '<rect x="3" y="3" width="6" height="6" fill="currentColor" fill-opacity=".9"/><rect x="11" y="3" width="6" height="6" fill="currentColor" fill-opacity=".4"/><rect x="19" y="3" width="6" height="6" fill="currentColor" fill-opacity=".2"/><rect x="3" y="12" width="6" height="6" fill="currentColor" fill-opacity=".3"/><rect x="11" y="12" width="6" height="6" fill="currentColor" fill-opacity=".7"/><rect x="19" y="12" width="6" height="6" fill="currentColor" fill-opacity=".5"/>',
      waterfall: '<path d="M4 19V9M9 9V5M14 5v6M19 11v-3M24 19V8"/>',
      stat: '<path d="M5 15V7l-2 2M10 8a2 2 0 0 1 4 0c0 2-4 4-4 7h4M17 7h4l-2 3a2.5 2.5 0 1 1-2 4"/>',
    };
    return s(T[kind] || T.column);
  }

  root.MMCharts = { setTheme, render, KINDS, parseNumber, thumb, CAT, fmt };
})(window);
