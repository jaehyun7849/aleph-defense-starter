const CACHE = 'vault-offline-notice-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE, { cache: 'reload' }))));
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // All API, authentication, protected data and non-navigation requests use
  // their normal network path. Only a public offline notice is ever cached.
  if (request.method !== 'GET' || request.mode !== 'navigate'
      || url.origin !== self.location.origin || url.search
      || !['/', '/index.html'].includes(url.pathname)) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(OFFLINE) || new Response('오프라인입니다. 인터넷 연결 후 다시 열어 주세요.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }));
});
