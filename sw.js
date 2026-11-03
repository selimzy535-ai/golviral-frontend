const CACHE_NAME = 'golviral-v11';

const PRECACHE_URLS = [
  `/`,
  `/index.html`,
  `/404.html`,
  `/auth.html`,
  `/post.html`,
  `/profile.html`,
  `/messages.html`,
  `/kyc.html`,
  `/manifest.json`,
  `/icon-192.png`,
  `/icon-512.png`
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
    return;
  }

  if (event.request.destination === 'video' || url.pathname.includes('/media/') || url.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) {
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
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const title = event.data.title || 'GolViral';
    const options = {
      body: event.data.body || 'New activity',
      icon: `/icon-192.png`,
      badge: `/icon-192.png`,
      vibrate: [200, 100, 200],
      tag: event.data.tag || Date.now().toString(),
      data: { url: event.data.url || '/profile.html' }
    };
    self.registration.showNotification(title, options);
  }
});

self.addEventListener('push', event => {
  const data = event.data? event.data.json() : {};
  const title = data.title || 'GolViral';
  const options = {
    body: data.body || 'You have a new notification',
    icon: `/icon-192.png`,
    badge: `/icon-192.png`,
    data: data.data || { url: `/index.html#feed` },
    vibrate: [200, 100, 200],
    tag: data.type || 'general'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const relativeUrl = event.notification.data?.url || `/index.html#feed`;
  const urlToOpen = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});