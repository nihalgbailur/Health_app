const CACHE_NAME = 'healthlens-v10';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data.mjs',
  './catalogLoader.mjs',
  './catalogPipeline.mjs',
  './rulesLoader.mjs',
  './nutritionTable.mjs',
  './riskEngine.mjs',
  './config/rules.json',
  './catalog/products.json',
  './catalog/regulatory_actions.json',
  './catalog/source_allowlist.json',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const isCatalogAsset =
    requestUrl.pathname.endsWith('/catalog/products.json') ||
    requestUrl.pathname.endsWith('/catalog/regulatory_actions.json') ||
    requestUrl.pathname.endsWith('/catalog/source_allowlist.json');

  if (isCatalogAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((networkResponse) => {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
