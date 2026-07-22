
const CACHE_NAME = 'golviral-v2';
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

// FETCH: NetworkFirst for API, CacheFirst for media, StaleWhileRevalidate for shell
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. API Calls: Network First
  if (url.origin === API_URL) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 2. Images & Videos: Cache First
  if (event.request.destination === 'image' || event.request.destination === 'video') {
    event.respondWith(
      caches.match(event.request).then(cached => 
        cached || fetch(event.request).then(res => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          return res;
        })
      )
    );
    return;
  }

  // 3. App Shell: Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => {
        // Network failure fallback handled by cached response below if available
      });

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
