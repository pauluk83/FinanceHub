/* FinanceHub phone companion service worker.
 *
 * Only the app shell and same-origin static assets are cached. Supabase, the
 * bank callback and any /api request always go to the network and their
 * responses are never stored, so a signed-out device cannot read a synced
 * budget from the cache.
 */
const CACHE = 'financehub-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/financehub-logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/bank-callback')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isCacheableAsset(url)) return;

  if (request.mode === 'navigate') {
    // Network-first so a new deployment is picked up immediately; the cached
    // shell is the offline fallback only.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    }),
  );
});
