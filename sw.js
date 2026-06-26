const CACHE_NAME = "golviral-v4.5";
const STATIC_CACHE = [
  "/",
  "/index.html",
  "/admin.html",
  "/manifest.json"
];

// Install: Cache static files
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_CACHE))
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Network-first for API, Cache-first for media <1.5MB
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Rule 1: API calls = Network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Rule 2: B2 Video Cache + 1.5MB Guard
  if (url.hostname.includes('backblazeb2.com') || url.pathname.match(/\.(mp4|jpg|png)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;

        return fetch(e.request).then(res => {
          const contentLength = res.headers.get('Content-Length');
          if (contentLength && parseInt(contentLength) > 1.5 * 1024 * 1024) {
            return new Response('File too large for cache', { status: 403 });
          }

          // Clone and cache if <1.5MB
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
          return res;
        });
      })
    );
    return;
  }

  // Rule 3: Everything else = Cache first
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});

// A2HS Prompt after 3 visits
let visitCount = 0;
self.addEventListener('message', e => {
  if (e.data === 'VISIT') {
    visitCount++;
    if (visitCount >= 3) {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SHOW_A2HS' }));
      });
    }
  }
});
