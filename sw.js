const CACHE_NAME = 'golviral-v5'; // bumped so all users update
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
    ).then(() => self.clients.claim())
  );
});

// HELPER: Delete items older than 72 hours
async function cleanupOldVideos() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  const now = Date.now();
  const MAX_AGE = 72 * 60 * 60 * 1000; // 72 hours

  for (const req of requests) {
    const res = await cache.match(req);
    if (!res) continue;
    const dateHeader = res.headers.get('date');
    const cachedTime = dateHeader ? new Date(dateHeader).getTime() : now;
    if (now - cachedTime > MAX_AGE) {
      await cache.delete(req);
    }
  }
}

// FETCH
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  // 0. BYPASS: Uploads and API calls. Keep uploads fast
  if (method !== 'GET') {
    return event.respondWith(fetch(event.request));
  }
  if (url.origin === API_URL) {
    return event.respondWith(fetch(event.request));
  }

  // 1. VIDEOS: Cache First. Catches B2 + signed URLs
  if (event.request.destination === 'video' || url.pathname.includes('/media/') || url.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached; // play from cache instantly

        return fetch(event.request).then(networkRes => {
          if (networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, resClone);
              cleanupOldVideos(); // cleanup in background
            });
          }
          return networkRes;
        }).catch(() => cached); // offline fallback
      })
    );
    return;
  }

  // 2. IMAGES: Cache First
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          if (res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          }
          return res;
        })
      )
    );
    return;
  }

  // 3. APP SHELL + HTML/CSS/JS: Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// BACKGROUND PREFETCH: called from index.html to preload next reels
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PREFETCH_VIDEO') {
    const url = event.data.url;
    caches.open(CACHE_NAME).then(cache => {
      cache.match(url).then(cached => {
        if (!cached) {
          fetch(url).then(res => {
            if (res.status === 200) {
              cache.put(url, res);
              cleanupOldVideos();
            }
          }).catch(()=>{})
        }
      })
    })
  }
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
