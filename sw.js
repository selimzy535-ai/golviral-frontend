const CACHE_NAME = 'golviral-shell-v4.6';  // App shell only. ~2MB max
const MEDIA_CACHE = 'golviral-media-v1';   // B2 videos only. Mobile quota safe

const APP_SHELL = [
  './',
  './index.html',
   './404.html', 
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: Cache the app shell only
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: Clean old caches. Keep only latest shell + media
self.addEventListener('activate', (e) => {
  const keep = [CACHE_NAME, MEDIA_CACHE];
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(k => !keep.includes(k) ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

// Fetch: Smart routing
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1. API calls to Render = Network only, never cache
  if (url.origin === 'https://golviral-api.onrender.com') {
    e.respondWith(
      fetch(req).catch(() => new Response('[]', {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // 2. B2 Video/Media = Separate cache, size capped
  if (url.hostname.includes('backblazeb2.com') || url.hostname.includes('s3.us-west')) {
    e.respondWith(
      caches.open(MEDIA_CACHE).then(cache =>
        cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            const cl = res.headers.get('Content-Length');
            // Only cache small files < 5MB to avoid killing PWA quota
            if (res.ok && cl && parseInt(cl) < 5000000) {
              cache.put(req, res.clone());
            }
            return res;
          });
        })
      )
    );
    return;
  }

  // 3. App Shell + JS/CSS/Images = Cache first, network fallback
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req).then(cached =>
        cached || fetch(req).then(res => {
          if (res.ok && req.method === 'GET') {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(() => cache.match('./index.html')) // SPA offline fallback
      )
    )
  );
});
