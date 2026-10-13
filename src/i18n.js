// Idioma de la interfaz: español o inglés. El texto en español es la clave: t('Guardado') da 'Saved' en inglés.
// El diccionario inglés está en i18n-en.js. Se carga antes que el resto de scripts, que usan MMI18n.t.
(function (root) {
  'use strict';
  const KEY = 'mindmap:lang';
  const has = Object.prototype.hasOwnProperty;
  const store = (v) => { try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch { return null; } return v; };

  // Preferencia guardada: 'auto' (según el navegador), 'es' o 'en'.
  const saved = store();
  const pref = saved === 'es' || saved === 'en' ? saved : 'auto';
  const nav = root.navigator || {};
  const first = String((nav.languages && nav.languages[0]) || nav.language || '').toLowerCase();
  const lang = pref === 'auto' ? (first.startsWith('es') ? 'es' : 'en') : pref;
  const EN = root.MMI18nEN || {};
  if (root.document && document.documentElement) document.documentElement.lang = lang;

  // {nombre} se sustituye por vars.nombre en los dos idiomas.
  const fill = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (has.call(vars, k) ? String(vars[k]) : m)) : s);
  function t(es, vars) {
    return fill(lang === 'en' && has.call(EN, es) ? EN[es] : es, vars);
  }

  // Traduce el HTML estático: textos y atributos que coinciden exactamente (sin espacios) con una clave.
  // Nunca toca el contenido del usuario: lo que hay dentro del lienzo, de la lista de mapas y carpetas o de un texto
  // editable (los atributos propios de esos contenedores, como su aria-label, sí se traducen).
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip'];
  const USER = '#world, .world-layer, .layer, #map-list, #breadcrumb, .mm-text, [contenteditable="true"], script, style';
  const swap = (v) => {
    const k = v.trim();
    return k && has.call(EN, k) ? v.replace(k, () => EN[k]) : null;
  };
  function apply(rootEl) {
    if (lang !== 'en' || !rootEl) return;
    const inUser = (el) => !!(el && el.closest && el.closest(USER));
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (inUser(n.parentElement)) continue;
      const v = swap(n.nodeValue);
      if (v != null) n.nodeValue = v;
    }
    for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
      if (inUser(el.parentElement) || el.isContentEditable) continue;
      for (const a of ATTRS) {
        const cur = el.getAttribute(a);
        const v = cur && swap(cur);
        if (v != null) el.setAttribute(a, v);
      }
    }
  }

  // Guarda la preferencia y recarga: los textos se fijan al dibujar la interfaz.
  function setLang(v) {
    store(v === 'es' || v === 'en' ? v : 'auto');
    root.location.reload();
  }

  root.MMI18n = { lang, pref, locale: lang === 'en' ? 'en-US' : 'es-ES', t, setLang, apply };
  if (root.document && document.body) apply(document.body);
})(typeof window !== 'undefined' ? window : globalThis);
