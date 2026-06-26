
const CACHE_NAME = "golviral-v4.5";
const STATIC_CACHE = [
  "/",
  "index.html",
  "admin.html",
  "manifest.json"
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

  // Rule 1: API calls = Network first, fallback to cache (GET requests only)
  if (url.pathname.startsWith('/api/')) {
    if (e.request.method !== 'GET') {
      return; // Let standard browser network behavior handle POST/PUT updates natively
    }
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
          // If the response is not valid or a partial content stream (206), bypass caching safely
          if (!res || res.status !== 200) return res;

          const contentLength = res.headers.get('Content-Length');
          if (contentLength && parseInt(contentLength) > 1.5 * 1024 * 1024) {
            return res; // FIX: Stream it directly to the user! Do NOT block it with a 403.
          }

          // Clone and cache if <1.5MB
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
          return res;
        }).catch(err => {
          // Fail gracefully if media is completely unreachable offline
          return new Response('Media offline', { status: 408, statusText: 'Network Timeout' });
        });
      })
    );
    return;
  }

  // Rule 3: Everything else = Cache first
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request).catch(() => {
      // Offline fallback asset rule if root layout completely misses cache boundaries
      if (e.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    }))
  );
});

```
