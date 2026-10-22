// Enlaces automáticos: convierte las direcciones escritas o pegadas en un texto (https://…, www.…) en enlaces.
// Trabaja sobre el HTML ya saneado de una línea: no toca lo que ya es un enlace ni lo que va en <code>.
// Sin DOM: se puede probar en Node y lo usan también las herramientas de los agentes.
(function (root) {
  'use strict';
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;
  // Lo que suele ir pegado detrás de una dirección sin ser parte de ella: puntuación y comillas.
  const TRAIL = /(?:[.,;:!?'\]]|&quot;|&gt;|&lt;|&#39;)+$/;

  function trimUrl(u) {
    let s = u;
    for (;;) {
      const t = s.replace(TRAIL, '');
      // Un paréntesis de cierre sin su apertura es del texto: «(ver https://x.com)».
      const c = t.endsWith(')') && (t.match(/\(/g) || []).length < (t.match(/\)/g) || []).length ? t.slice(0, -1) : t;
      if (c === s) return s;
      s = c;
    }
  }

  function linkText(text) {
    return text.replace(URL_RE, (m) => {
      const u = trimUrl(m);
      const www = /^www\./i.test(u);
      if (www ? !/^www\.[^./]+\.[^.]/i.test(u) : !/^https?:\/\/[^/]+\.[^/]|^https?:\/\/localhost/i.test(u)) return m;
      return `<a href="${www ? 'https://' : ''}${u}" target="_blank" rel="noopener">${u}</a>${m.slice(u.length)}`;
    });
  }

  function linkify(html) {
    const s = String(html == null ? '' : html);
    if (!/https?:\/\/|www\./i.test(s)) return s;
    let inA = 0, inCode = 0;
    return s.split(/(<[^>]*>)/).map((part) => {
      if (part[0] === '<') {
        const m = /^<(\/?)(a|code)\b/i.exec(part);
        if (m) {
          const d = m[1] ? -1 : 1;
          if (m[2].toLowerCase() === 'a') inA = Math.max(0, inA + d); else inCode = Math.max(0, inCode + d);
        }
        return part;
      }
      return inA || inCode ? part : linkText(part);
    }).join('');
  }

  // ¿Es el texto pegado una sola dirección? Devuelve el enlace (con https:// delante si empezaba por www.).
  function asUrl(text) {
    const s = String(text || '').trim();
    if (!s || /\s/.test(s)) return null;
    if (/^https?:\/\/[^/\s]+\.[^/\s]|^https?:\/\/localhost/i.test(s)) return s;
    if (/^www\.[^./\s]+\.[^.\s]/i.test(s)) return `https://${s}`;
    return null;
  }

  const api = { linkify, asUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMLinks = api;
})(typeof window !== 'undefined' ? window : globalThis);
