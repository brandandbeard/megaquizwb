const CACHE_NAME = 'mega-quiz-v1';
const urlsToCache = [
  '.',
  'index.html',
  'class5.html',
  'class6.html',
  'class7.html',
  'class8.html',
  'class9.html',
  'class10.html',
  'competitive.html',
  'manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});