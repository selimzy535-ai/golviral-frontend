const CACHE_NAME = 'golviral-v12';
const VIDEO_CACHE = 'golviral-videos-v1';
const APP_BASE_URL = 'https://golviral.com';

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

const MAX_VIDEOS = 3; // keep only 3 for instant back-scroll

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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== VIDEO_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  // 1. ALWAYS BYPASS API + admin
  if (
    method !== 'GET' ||
    url.hostname.includes('onrender.com') ||
    url.hostname.includes('workers.dev') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('admin.html')
  ) {
    return event.respondWith(fetch(event.request));
  }

  const isVideo = event.request.destination === 'video' ||
                  url.pathname.includes('/media/') ||
                  url.pathname.match(/\.(mp4|mov|webm|m4v)$/i);

  // 2. VIDEO - fixed instant replay
  if (isVideo) {
    // Range requests = bypass cache (fixes crash)
    if (event.request.headers.has('range')) {
      return event.respondWith(fetch(event.request));
    }

    event.respondWith(
      caches.open(VIDEO_CACHE).then(async cache => {
        // NO ignoreSearch - fixes repeat bug
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const res = await fetch(event.request);
          if (res.ok && res.status === 200) {
            // LRU: keep only 3 videos - fixes quota logout
            const keys = await cache.keys();
            if (keys.length >= MAX_VIDEOS) {
              await cache.delete(keys[0]);
            }
            cache.put(event.request, res.clone());
          }
          return res;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // 3. IMAGE - normal cache
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 4. HTML/JS/CSS - stale while revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
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