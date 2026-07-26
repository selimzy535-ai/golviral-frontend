const CACHE_NAME = 'golviral-v3'; // bumped version so it updates
const APP_BASE_URL = 'https://selimzy535-ai.github.io/golviral-frontend';
const API_URL = 'https://golviral-api.onrender.com';

const PRECACHE_URLS = [
  `${APP_BASE_URL}/`,
  `${APP_BASE_URL}/index.html`,
  `${APP_BASE_URL}/auth.html`,
  `${APP_BASE_URL}/post.html`,
  `${APP_BASE_URL}/messages.html`,
  `${APP_BASE_URL}/profile.html`,
  `${APP_BASE_URL}/manifest.json`
];

// INSTALL: Precache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ACTIVATE: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// FETCH: FIXED - Don't cache POST/PUT and don't cache uploads
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  // 0. CRITICAL FIX: BYPASS SW FOR POST, PUT, DELETE, B2, FFMPEG
  // This fixes "FetchEvent.respondWith returned null" and ffmpeg upload
  if (
    method !== 'GET' || 
    url.origin === API_URL ||
    url.hostname.includes('backblazeb2.com') ||
    url.pathname.includes('/ffmpeg-core.js') ||
    url.pathname.includes('/ffmpeg.wasm')
  ) {
    return event.respondWith(fetch(event.request)); // network only, no cache
  }

  // 1. Images & Videos from B2/CDN: Cache First
  if (event.request.destination === 'image' || event.request.destination === 'video') {
    event.respondWith(
      caches.match(event.request).then(cached => 
        cached || fetch(event.request).then(res => {
          // Don't cache B2 videos to avoid stale black screens
          if(url.hostname.includes('backblazeb2.com')) return res;
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          return res;
        })
      )
    );
    return;
  }

  // 2. App Shell: Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => {});

      return cached || fetchPromise;
    })
  );
});

// PUSH: Show notification
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'GolViral';
  const options = {
    body: data.body || 'You have a new notification',
    icon: `${APP_BASE_URL}/icon-192.png`,
    badge: `${APP_BASE_URL}/icon-192.png`,
    data: data.data || { url: '/index.html#feed' },
    vibrate: [200, 100, 200],
    tag: data.type || 'general'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// NOTIFICATION CLICK: Open app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = APP_BASE_URL + (event.notification.data.url || '/index.html#feed');
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
