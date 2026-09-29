const CACHE_NAME = 'golviral-v11'; // keep same name = no blank screen
const APP_BASE_URL = 'https://golviral.com';
const APP_FOLDER = '';

const PRECACHE_URLS = [
  `${APP_BASE_URL}/`,
  `${APP_BASE_URL}/index.html`,
  `${APP_BASE_URL}/404.html`,
  `${APP_BASE_URL}/auth.html`,
  `${APP_BASE_URL}/post.html`,
  `${APP_BASE_URL}/profile.html`,
  `${APP_BASE_URL}/messages.html`,
  `${APP_BASE_URL}/kyc.html`,
  `${APP_BASE_URL}/manifest.json`,
  `${APP_BASE_URL}/icon-192.png`,
  `${APP_BASE_URL}/icon-512.png`
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      Promise.allSettled(PRECACHE_URLS.map(u => c.add(u).catch(()=>{})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k!== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Throttled cleanup
let isCleaning = false;
async function cleanupOldVideos() {
  if (isCleaning) return;
  isCleaning = true;
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    const now = Date.now();
    const MAX_AGE = 72 * 60 * 60 * 1000;
    for (const req of requests) {
      const res = await cache.match(req);
      if (!res) continue;
      const dateHeader = res.headers.get('date');
      const cachedTime = dateHeader? new Date(dateHeader).getTime() : now;
      if (now - cachedTime > MAX_AGE) {
        await cache.delete(req);
      }
    }
  } catch (err) {
    console.error("Cleanup failed", err);
  } finally {
    isCleaning = false;
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  if (
    method!== 'GET' ||
    url.pathname.includes('sw.js') ||
    url.pathname.includes('manifest.json') ||
    url.hostname.includes('onrender.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('admin.html')
  ) {
    return; // FIX: was respondWith(fetch) - caused double respond
  }

  if (event.request.destination === 'video' || url.pathname.includes('/media/') || url.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        // FIX: REMOVED { ignoreSearch: true } - this was causing repeat
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          // FIX: REMOVED returnRangeResponse + arrayBuffer - was causing crash
          // If browser asks for range, just fetch range from network
          if (event.request.headers.has('range')) {
            return fetch(event.request);
          }

          const networkRes = await fetch(event.request);
          if (networkRes.status === 200) {
            cache.put(event.request, networkRes.clone());
            event.waitUntil(cleanupOldVideos());
          }
          return networkRes;
        } catch {
          return cached;
        }
      })
    );
    return;
  }

  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          if (res.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
          }
          return res;
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PREFETCH_VIDEO') {
    const url = event.data.url;
    caches.open(CACHE_NAME).then(cache => {
      // FIX: also here
      cache.match(url).then(cached => {
        if (!cached) {
          fetch(url).then(res => {
            if (res.status === 200) {
              cache.put(url, res);
            }
          }).catch(()=>{});
        }
      });
    });
  }
});

self.addEventListener('push', event => {
  const data = event.data? event.data.json() : {};
  const title = data.title || 'GolViral';
  const options = {
    body: data.body || 'You have a new notification',
    icon: `${APP_BASE_URL}/icon-192.png`,
    badge: `${APP_BASE_URL}/icon-192.png`,
    data: data.data || { url: `/index.html#feed` },
    vibrate: [200, 100, 200],
    tag: data.type || 'general'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const relativeUrl = event.notification.data?.url || `/index.html#feed`;
  const urlToOpen = new URL(relativeUrl, APP_BASE_URL).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});