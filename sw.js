const CACHE_NAME = 'golviral-v4.5';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: Cache the app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

// Fetch: Smart routing
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 1. API calls to Render = Network first, no cache
  if (url.origin === 'https://golviral-api.onrender.com') {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // 2. Video/Media from B2 = Cache first for offline playback
  if (url.hostname.includes('backblazeb2.com') || url.hostname.includes('s3.us-west')) {
    e.respondWith(
      caches.match(e.request).then(cached => 
        cached || fetch(e.request).then(res => {
          // Only cache small videos < 5MB to avoid quota
          const cl = res.headers.get('Content-Length');
          if (cl && parseInt(cl) < 5000000) {
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
          }
          return res;
        })
      )
    );
    return;
  }

  // 3. App Shell = Cache first
  e.respondWith(
    caches.match(e.request).then(cached => 
      cached || fetch(e.request).then(res => {
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match('./index.html')) // SPA fallback
    )
  );
});
