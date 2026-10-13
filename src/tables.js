// Tablas: lectura de CSV/TSV/Markdown/HTML, exportación a CSV y datos para los gráficos.
(function (root) {
  'use strict';
  const MAX_ROWS = 500, MAX_COLS = 50;

  const strip = (html) => { const t = document.createElement('template'); t.innerHTML = html; return t.content.textContent.replace(/ /g, ' ').trim(); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // CSV con comillas ("a, b", "dice ""hola""") y saltos de línea dentro de celdas.
  function splitDelimited(text, delim) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  // Elige el separador más coherente entre las primeras líneas: tabulador, punto y coma, coma o barra.
  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
    let best = null, bestScore = 0;
    for (const d of ['\t', ';', ',', '|']) {
      const counts = splitDelimited(lines.join('\n'), d).map((r) => r.length);
      if (!counts.length || counts[0] < 2) continue;
      const same = counts.filter((c) => c === counts[0]).length / counts.length;
      const score = same * Math.min(counts[0], 20) + (d === '\t' ? 0.5 : 0);
      if (same >= 0.8 && score > bestScore) { best = d; bestScore = score; }
    }
    return best;
  }

  function normalize(rows) {
    rows = rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => String(c).trim()));
    const cols = Math.max(1, ...rows.map((r) => r.length));
    return rows.map((r) => [...r, ...Array(cols - r.length).fill('')]);
  }

  function parseMarkdown(text) {
    const lines = text.trim().split(/\r?\n/).map((l) => l.trim());
    if (lines.length < 2 || !lines.every((l) => l.startsWith('|') || l.includes('|'))) return null;
    if (!/^\|?\s*:?-{2,}/.test(lines[1])) return null;
    const cells = (l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    return [cells(lines[0]), ...lines.slice(2).map(cells)];
  }

  function parseHtml(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    const table = t.content.querySelector('table');
    if (!table) return null;
    const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.children].filter((c) => /^(TD|TH)$/.test(c.tagName)).map((c) => esc(c.textContent.replace(/ /g, ' ').trim())));
    return rows.filter((r) => r.length);
  }

  // Devuelve filas de texto si el contenido pegado/importado parece una tabla, o null.
  function parse(text, html) {
    if (html) { const r = parseHtml(html); if (r && r.length) return { rows: normalize(r), escaped: true }; }
    if (!text || !text.trim()) return null;
    const md = parseMarkdown(text);
    if (md) return { rows: normalize(md) };
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    // Un esquema con sangría (tabuladores solo al principio) no es una tabla.
    if (/\t/.test(text) && lines.every((l) => !/\S\t/.test(l))) return null;
    const d = detectDelimiter(text);
    if (!d) return null;
    const rows = splitDelimited(text, d);
    if (rows.length < 2 && !(rows[0] && rows[0].length >= 2 && d === '\t')) return null;
    // Con comas, frases normales pueden parecer CSV: se exige ≥ 3 columnas o alguna columna numérica.
    if (d === ',') {
      const cols = rows[0].length;
      const numeric = [...Array(cols).keys()].some((c) => rows.slice(1).every((r) => /^\s*-?[\d.,]+\s*%?$/.test(r[c] || '')));
      if (cols < 3 && !numeric) return null;
    }
    return { rows: normalize(rows) };
  }

  // CSV para Excel en español: punto y coma, comillas cuando hace falta y BOM para los acentos.
  function toCSV(rows) {
    const q = (v) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return `﻿${rows.map((r) => r.map((c) => q(strip(c))).join(';')).join('\r\n')}`;
  }

  // Datos para un gráfico: etiquetas de una columna y series numéricas de las demás.
  function chartData(table, opts, parseNumber) {
    const rows = table.rows.map((r) => r.map(strip));
    const hasHeader = table.header !== false;
    const head = hasHeader ? rows[0] : rows[0].map((_, i) => `Columna ${i + 1}`);
    const body = hasHeader ? rows.slice(1) : rows;
    const cols = head.length;
    const numericCol = (c) => {
      const vals = body.map((r) => r[c]).filter((v) => v !== '');
      return vals.length > 0 && vals.filter((v) => parseNumber(v) != null).length / vals.length >= 0.6;
    };
    let labelCol = opts.labelCol;
    if (labelCol == null || labelCol >= cols) labelCol = [...Array(cols).keys()].find((c) => !numericCol(c)) ?? -1;
    const auto = [...Array(cols).keys()].filter((c) => c !== labelCol && numericCol(c));
    const seriesCols = (opts.seriesCols && opts.seriesCols.filter((c) => c < cols && c !== labelCol)) || auto;
    return {
      head, labelCol, seriesCols, numericCols: auto,
      labels: body.map((r, i) => (labelCol >= 0 ? r[labelCol] || `Fila ${i + 1}` : `Fila ${i + 1}`)),
      series: seriesCols.map((c) => ({ name: head[c] || `Columna ${c + 1}`, col: c, values: body.map((r) => parseNumber(r[c])) })),
    };
  }

  root.MMTables = { parse, toCSV, chartData, strip, MAX_ROWS, MAX_COLS };
})(window);
