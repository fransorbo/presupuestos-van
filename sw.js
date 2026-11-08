// Service worker: permite usar la app sin conexión.
// Estrategia "primero la red": si hay internet se usa siempre la versión más nueva
// (y se guarda una copia); sin internet se usa la copia guardada.
// Al publicar cambios grandes, subir VERSION para limpiar las copias viejas.
const VERSION = 'v4';
const CACHE = `presupuestos-van-${VERSION}`;
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/calc.js',
  './js/config.js',
  './js/distancias.js',
  './js/format.js',
  './js/maps.js',
  './js/storage.js',
  './js/validar.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('presupuestos-van-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function conTiempoLimite(promesa, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error('timeout')), ms);
    promesa.then((r) => (clearTimeout(t), ok(r)), (err) => (clearTimeout(t), mal(err)));
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    conTiempoLimite(fetch(req), 4000)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
