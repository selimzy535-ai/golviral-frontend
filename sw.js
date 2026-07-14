const CACHE_NAME = 'golviral-shell-v4.6.1';  // App shell only. ~2MB max
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

  // 1. API calls to Render = Network only, never cache. Offline fallback
  if (url.origin === 'https://golviral-api.onrender.com') {
    e.respondWith(
      fetch(req).catch(() => {
        // Return proper offline JSON so frontend doesn't crash
        if(url.pathname.includes('/feed')){
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' }
          })
        }
        return new Response(JSON.stringify({error: 'Offline'}), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    );
    return;
  }

  // 2. B2 Video/Media = Separate cache. Strip query params because signed URLs change
  if (url.hostname.includes('backblazeb2.com') || url.hostname.includes('s3.us-west')) {
    // Create a cache key without query string so 15min signed URL can still hit cache
    const cacheKey = new Request(url.origin + url.pathname, {method: 'GET'});
    
    e.respondWith(
      caches.open(MEDIA_CACHE).then(cache =>
        cache.match(cacheKey).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            const cl = res.headers.get('Content-Length');
            // Only cache small files < 5MB to avoid killing PWA quota
            // And only cache GET 200
            if (res.ok && req.method === 'GET' && cl && parseInt(cl) < 5000000) {
              cache.put(cacheKey, res.clone());
            }
            return res;
          }).catch(() => {
            // Offline video fallback
            return new Response('Video offline', {status: 503})
          })
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

// 4. NEW: Allow frontend to force update SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
