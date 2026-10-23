// Çevrimdışı çalışma: dosyalar önbellekten gelir, arka planda güncellenir.
// Dosya listesi değişince VERSION'ı artır.
const VERSION = 'slot-v2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/logic/common.js', 'js/logic/tumble.js', 'js/logic/megaways.js', 'js/logic/book.js', 'js/logic/classic.js',
  'js/core.js', 'js/views.js', 'js/games.js', 'js/app.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
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
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
