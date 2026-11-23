/* FinanceHub phone companion service worker.
 *
 * Only the app shell and same-origin static assets are cached. Supabase, the
 * bank callback and any /api request always go to the network and their
 * responses are never stored, so a signed-out device cannot read a synced
 * budget from the cache.
 */
const CACHE = 'financehub-shell-v2';
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

/**
 * Push: the sender posts an encrypted JSON payload `{ title, body, url, tag }`.
 * The notification is shown by the service worker, because a push event without
 * a visible notification is rejected by the browser.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'FinanceHub';
  const url = typeof payload.url === 'string' && payload.url.startsWith(self.location.origin) ? payload.url : '/';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof payload.body === 'string' ? payload.body : '',
    tag: typeof payload.tag === 'string' ? payload.tag : 'financehub',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if ('navigate' in client) await client.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

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
