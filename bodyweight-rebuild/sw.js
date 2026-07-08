/* Bodyweight Rebuild — service worker: cache-first app shell for offline use */
const CACHE = 'bwr-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './icon-maskable.svg',
  './css/app.css',
  './js/app.js', './js/data.js', './js/store.js', './js/progression.js',
  './js/charts.js', './js/ui.js', './js/player.js', './js/views.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Network-first for the shell (so deploys land), cache fallback for offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match('./index.html')))
  );
});
