const CACHE = 'study-pal-shell-v1';
const MAX_RUNTIME_ITEMS = 80;
const base = new URL('./', self.location.href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([base.href, new URL('manifest.webmanifest', base).href, new URL('study-pal.svg', base).href]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('study-pal-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(base.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match(base.href));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > MAX_RUNTIME_ITEMS) await cache.delete(keys[0]);
      }
      return response;
    } catch {
      return new Response('This Study Pal file is not available offline yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
