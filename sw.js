const CACHE_NAME = 'golviral-v2.1';
const APP_BASE_URL = 'https://selimzy535-ai.github.io/golviral-frontend';

const PRECACHE_URLS = [
  `${APP_BASE_URL}/`,
  `${APP_BASE_URL}/index.html`,
  `${APP_BASE_URL}/admin.html`,
  `${APP_BASE_URL}/manifest.json`
];

// INSTALL: Precache shell
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

// FETCH: NetworkFirst for API, CacheFirst for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. API Calls: Network First with fallback
  if (url.origin === 'https://golviral-api.onrender.com') {
    event.respondWith(
      fetch(event.request).catch(() => 
        caches.match(event.request)
      )
    );
    return;
  }

  // 2. B2 Media: Cache First for 15min
  if (url.hostname.includes('backblazeb2.com')) {
    event.respondWith(
      caches.match(event.request).then(res => 
        res || fetch(event.request).then(fetchRes => {
          const cacheRes = fetchRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cacheRes));
          return fetchRes;
        })
      )
    );
    return;
  }

  // 3. App Shell: Cache First
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});

// PUSH: Show notification
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'GolViral';
  const options = {
    body: data.body || 'New notification',
    icon: `${APP_BASE_URL}/icon-192.png`,
    badge: `${APP_BASE_URL}/icon-192.png`,
    data: data.data || {},
    vibrate: [200, 100, 200],
    tag: data.type || 'general'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// NOTIFICATION CLICK: Open app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = event.notification.data.url || `${APP_BASE_URL}/index.html#feed`;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
