const VERSION = '__MONTAJES_BUILD__';
const scope = new URL(self.registration.scope);
const prefix = `montajes-sublimacion:${scope.href}:`;
const cacheName = prefix + VERSION;
const index = new URL('index.html', scope).href;
const assets = new Set(__MONTAJES_ASSETS__.map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      await cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' })));
      const html = await cache.match(index);
      if (!(await html.text()).includes(`<meta name="montajes-pwa" content="${VERSION}">`)) {
        throw new Error('GitHub Pages todavía no entrega el HTML de esta versión');
      }
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'ACTIVAR_MONTAJES' && event.source?.url?.startsWith(scope.href)) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // Una compilación posterior puede haber empezado a preparar su propia caché.
    if (!self.registration.installing && !self.registration.waiting) {
      await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName).map(name => caches.delete(name)));
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const path = url.origin + url.pathname;
  const entry = request.mode === 'navigate' && path === scope.href ? index : path;
  if (!assets.has(entry)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(entry)) || fetch(request);
  })());
});
