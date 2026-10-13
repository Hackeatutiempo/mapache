// Guardado de mapas y carpetas en IndexedDB (en este navegador, sin archivos).
(function (root) {
  'use strict';
  // Nombre de la base de datos y prefijo 'mindmap:' de las preferencias: se mantienen para no perder los datos ya guardados.
  const DB = 'mindmap';
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('maps')) db.createObjectStore('maps', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' });
        // Vídeos subidos: { id, blob, type, name }. Van aparte del mapa para no cargar el guardado ni el deshacer.
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
    });
  }

  const table = (name) => ({
    all: () => tx(name, 'readonly', (s) => s.getAll()),
    get: (id) => tx(name, 'readonly', (s) => s.get(id)),
    put: (v) => tx(name, 'readwrite', (s) => { s.put(v); }),
    remove: (id) => tx(name, 'readwrite', (s) => { s.delete(id); }),
  });

  const maps = table('maps');
  const Store = {
    ...maps,
    folders: table('folders'),
    media: table('media'),
    // Pide al navegador que no borre estos datos al liberar espacio.
    persist: () => (navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false)),
  };

  root.MMStore = Store;
})(window);
