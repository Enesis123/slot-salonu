// Çevrimdışı çalışma: önce internetten taze dosya, bağlantı yoksa önbellek.
// (Önbellek-önce eski sayfa ile yeni betiği karıştırıp oyunu bozuyordu.)
// Dosya listesi değişince VERSION'ı artır.
const VERSION = 'slot-v10';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/logic/common.js', 'js/logic/tumble.js', 'js/logic/megaways.js', 'js/logic/book.js', 'js/logic/classic.js', 'js/logic/throw.js', 'js/logic/rush.js', 'js/characters.js',
  'js/core.js', 'js/views.js', 'js/games.js', 'js/admin-config.js', 'js/app.js',
  'img/dede.webp', 'img/amazon.webp', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
