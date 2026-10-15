// PocketPulse service worker.
//
// It makes the app open fast and open at all without a connection; it does
// not keep data offline. Supabase calls are never touched: they go straight
// to the network, so what is shown is always the server's data or nothing.
//
// Pages (navigations): network first, so a new deploy is picked up on the
// next open; the last good copy of the page is used when offline.
// Built files under /assets/: cache first. Their names change with every
// build, so a cached one is never stale; old ones are trimmed.
// Anything else same-origin (icons, manifest): network first, cache fallback.

const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const MAX_ASSETS = 60;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, ASSETS]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, PAGES, '/index.html'));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req, PAGES));
  }
});

async function networkFirst(req, cacheName, fallbackPath) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackPath || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackPath || req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(old);
  }
  return res;
}
