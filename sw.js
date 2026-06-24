const CACHE_NAME = 'golviral-v4.5';
const MAX_VIDEO_SIZE = 1.5 * 1024 * 1024; // 1.5MB

const STATIC_CACHE = [
  '/index.html',
  '/manifest.json',
  '/auth.html',
  '/post.html',
  '/wallet.html',
  '/profile.html'
];

// Install - cache static files
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_CACHE))
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch interceptor
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Static files + GET API endpoints = Network first
  if ((url.origin.includes('golviral-api.onrender.com') || STATIC_CACHE.includes(url.pathname)) && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 2. B2 video/images = Size check + Cache (Only for GET requests)
  if ((url.hostname.includes('backblazeb2.com') || url.hostname.includes('b2.com')) && e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) {
          // Send message to page to show "Cached" badge
          self.clients.matchAll().then(clients => {
            clients.forEach(c => c.postMessage({type: 'CACHED', url: e.request.url}));
          });
          return cached;
        }

        return fetch(e.request).then(async res => {
          if (!res.ok) return res;

          // HTTP/2 and HTTP/3 standards require lowercase header selection
          const contentLength = res.headers.get('content-length');
          const size = contentLength ? parseInt(contentLength, 10) : 0;

          // Skip caching if file is > 1.5MB, but STILL return the network response so it plays!
          if (size > MAX_VIDEO_SIZE) {
            return res; 
          }

          // Clone and cache if size matches budget constraints
          const resClone = res.clone();
          const cache = await caches.open(CACHE_NAME);

          // Keep only last 3 videos in cache to respect storage constraints
          const keys = await cache.keys();
          const videoKeys = keys.filter(k => k.url.includes('backblazeb2.com') || k.url.includes('b2.com'));
          if (videoKeys.length >= 3) {
            await cache.delete(videoKeys[0]); // FIFO eviction strategy
          }

          cache.put(e.request, resClone);
          return res;
        }).catch(() => new Response('Offline', {status: 503, headers: {'Content-Type': 'text/plain'}}));
      })
    );
    return;
  }

  // 3. Default fallback = cache first
  if (e.request.method === 'GET') {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});

// Handle incoming messages from frontend client contexts
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_CACHE') {
    caches.match(e.data.url).then(cached => {
      if (e.ports && e.ports[0]) {
        e.ports[0].postMessage({cached: !!cached});
      }
    });
  }
});
