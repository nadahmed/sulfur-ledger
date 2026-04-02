self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Simple pass-through for all requests.
  // This satisfies the PWA installability requirement for a service worker with a fetch event.
});
