const CACHE_NAME = 'bombe-airsoft-v15';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './digital-7.ttf',
  './icon-192.png',
  './icon-512.png',
  './Assets/BombScreen.png',
  './Assets/Bouton Param%C3%A8tres.png',
  './Assets/Temps%20Restant.png',
  './Assets/0.png',
  './Assets/1.png',
  './Assets/2.png',
  './Assets/3.png',
  './Assets/4.png',
  './Assets/5.png',
  './Assets/6.png',
  './Assets/7.png',
  './Assets/8.png',
  './Assets/9.png',
  './Assets/Asterisk.png',
  './Assets/Hashtag.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
