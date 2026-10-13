// Fusión a tres bandas de tableros: lo que cambiaste tú (ours) y lo que cambió otro a la vez, por ejemplo tu agente
// de IA (theirs), sobre la última versión común (base). Se fusiona por nodo y por objeto, y dentro de cada uno por
// campo; si los dos cambian el mismo campo, gana el tuyo. Funciona en el navegador y en Node.
// SPDX-License-Identifier: AGPL-3.0-or-later
(function (root) {
  'use strict';

  // JSON con las claves ordenadas: dos objetos iguales dan el mismo texto aunque se crearan en otro orden.
  function stable(v) {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  const same = (a, b) => stable(a) === stable(b);
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  // Un valor: si solo cambió un lado, ese; si cambiaron los dos, objetos campo a campo y si no, el nuestro.
  function value(b, o, t) {
    if (same(o, t)) return copy(o);
    if (same(o, b)) return copy(t);
    if (same(t, b)) return copy(o);
    // Uno lo borró y el otro lo cambió: se conserva el cambio (no se pierde trabajo).
    if (o === undefined) return copy(t);
    if (t === undefined) return copy(o);
    if (isObj(o) && isObj(t)) return fields(isObj(b) ? b : {}, o, t);
    return copy(o);
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function fields(b, o, t) {
    const out = {};
    for (const k of new Set([...Object.keys(o), ...Object.keys(t), ...Object.keys(b)])) {
      const v = value(b[k], o[k], t[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  // Colección por id (nodos u objetos).
  function table(b = {}, o = {}, t = {}) {
    const out = {};
    for (const id of new Set([...Object.keys(o), ...Object.keys(t), ...Object.keys(b)])) {
      const v = value(b[id], o[id], t[id]);
      if (v !== undefined) out[id] = v;
    }
    return out;
  }

  function mergeDoc(base, ours, theirs) {
    if (!ours) return copy(theirs);
    if (!theirs) return copy(ours);
    const b = base || {};
    const out = fields(
      { ...b, nodes: undefined, items: undefined },
      { ...ours, nodes: undefined, items: undefined },
      { ...theirs, nodes: undefined, items: undefined },
    );
    out.nodes = table(b.nodes, ours.nodes, theirs.nodes);
    out.items = table(b.items, ours.items, theirs.items);
    // Si un lado borró una rama mientras el otro le añadía hijos, la rama vuelve para no dejar nodos sueltos.
    for (const n of Object.values(out.nodes)) {
      let p = n.parentId;
      while (p != null && !out.nodes[p]) {
        const back = (ours.nodes || {})[p] || (theirs.nodes || {})[p] || (b.nodes || {})[p];
        if (!back) { n.parentId = out.rootId; break; }
        out.nodes[p] = copy(back);
        p = back.parentId;
      }
    }
    if (!out.nodes[out.rootId]) out.rootId = ours.nodes && ours.nodes[ours.rootId] ? ours.rootId : theirs.rootId;
    if (!out.nodes[out.rootId]) out.nodes[out.rootId] = copy((ours.nodes || {})[out.rootId] || (theirs.nodes || {})[out.rootId]);
    return out;
  }

  // Tablero completo: los datos (título, carpeta, color, icono) campo a campo, y el documento con mergeDoc.
  function mergeBoard(base, ours, theirs) {
    const b = base || {};
    const out = fields({ ...b, doc: undefined, rev: undefined }, { ...ours, doc: undefined, rev: undefined }, { ...theirs, doc: undefined, rev: undefined });
    out.doc = mergeDoc(b.doc, ours.doc, theirs.doc);
    out.updatedAt = Math.max(ours.updatedAt || 0, theirs.updatedAt || 0);
    return out;
  }

  const api = { mergeDoc, mergeBoard, stable, same };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMMerge = api;
})(typeof window !== 'undefined' ? window : globalThis);
