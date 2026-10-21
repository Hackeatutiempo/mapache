// Permite abrir la app aunque el servidor local no esté en marcha (usa la última versión guardada).
const CACHE = 'mapache-v36';
const FILES = ['./', 'index.html', 'styles.css', 'i18n-en.js', 'i18n.js', 'layout.js', 'icons.js', 'shapes.js', 'tables.js', 'charts.js', 'connectors.js', 'arrange.js', 'ink.js', 'merge.js', 'store.js', 'sidebar.js', 'comments.js', 'app.js', 'team-ui.js', 'manifest.webmanifest', 'icon.svg', 'creator.webp'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (versión más nueva); si el servidor no responde, la copia guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Los tableros y los avisos en directo van siempre al servidor (nunca a la caché).
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/') || url.pathname.endsWith('/mcp')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))),
  );
});
