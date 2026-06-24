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
      Promise.all(keys.filter(k => k!== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch interceptor
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Static files + API = Network first
  if(url.origin.includes('golviral-api.onrender.com') || STATIC_CACHE.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if(res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 2. B2 video/images = Size check + Cache
  if(url.hostname.includes('backblazeb2.com') || url.hostname.includes('b2.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if(cached) {
          // Send message to show "Cached" badge
          self.clients.matchAll().then(clients => {
            clients.forEach(c => c.postMessage({type: 'CACHED', url: e.request.url}));
          });
          return cached;
        }

        return fetch(e.request).then(async res => {
          if(!res.ok) return res;

          const contentLength = res.headers.get('Content-Length');
          const size = contentLength? parseInt(contentLength) : 0;

          // Abort if >1.5MB to save user data
          if(size > MAX_VIDEO_SIZE) {
            return new Response('Video too large for cache', {status: 403});
          }

          // Clone and cache if <1.5MB
          const resClone = res.clone();
          const cache = await caches.open(CACHE_NAME);

          // Keep only last 3 videos in cache
          const keys = await cache.keys();
          const videoKeys = keys.filter(k => k.url.includes('backblazeb2.com') || k.url.includes('b2.com'));
          if(videoKeys.length >= 3) {
            await cache.delete(videoKeys[0]); // FIFO
          }

          cache.put(e.request, resClone);
          return res;
        }).catch(() => new Response('Offline', {status: 503}));
      })
    );
    return;
  }

  // 3. Default = cache first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

// Handle messages from page for "Cached" badge
self.addEventListener('message', e => {
  if(e.data.type === 'CHECK_CACHE') {
    caches.match(e.data.url).then(cached => {
      e.ports[0].postMessage({cached:!!cached});
    });
  }
});
