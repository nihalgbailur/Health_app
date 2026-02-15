const CACHE_NAME = 'healthlens-v12';
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
  './catalog/avoid_markers.json',
  './catalog/source_allowlist.json',
  './manifest.webmanifest',
  './assets/hero_bg.png',
  './assets/scan_illustration.png',
  './assets/logo.png',
  './assets/icon_additives.png',
  './assets/icon_nutrition.png',
  './assets/icon_chemicals.png',
  './assets/coach_avatar.png',
  './assets/empty_scan.png',
  './assets/empty_saved.png',
  './assets/watchdog_symbol.png',
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
    requestUrl.pathname.endsWith('/catalog/avoid_markers.json') ||
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
