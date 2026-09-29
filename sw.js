const CACHE_NAME = 'golviral-v13';
const VIDEO_CACHE = 'golviral-videos-v1';
const APP_BASE_URL = 'https://golviral.com';

const PRECACHE_URLS = [
  `/index.html`,
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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== VIDEO_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // BYPASS - do not cache at all, single respondWith
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('onrender.com') ||
    url.hostname.includes('workers.dev') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('admin.html')
  ) {
    return; // let browser handle it natively - NO respondWith
  }

  const isVideo = event.request.destination === 'video' ||
                  url.pathname.includes('/media/') ||
                  url.pathname.match(/\.(mp4|mov|webm|m4v)$/i);

  // VIDEO - NO range handling, NO arrayBuffer, LRU 3
  if (isVideo) {
    // If it's a range request, NEVER use cache - return network directly
    if (event.request.headers.has('range')) {
      event.respondWith(fetch(event.request));
      return;
    }

    event.respondWith(
      caches.open(VIDEO_CACHE).then(async cache => {
        try {
          const cached = await cache.match(event.request);
          if (cached) return cached;

          const res = await fetch(event.request);
          // only cache 200 full videos, not 206 partials
          if (res.ok && res.status === 200) {
            const keys = await cache.keys();
            if (keys.length >= 3) {
              await cache.delete(keys[0]);
            }
            // clone before put
            cache.put(event.request, res.clone()).catch(()=>{});
          }
          return res;
        } catch (err) {
          // fallback to cache if network fails
          const fallback = await cache.match(event.request);
          return fallback || fetch(event.request);
        }
      })
    );
    return;
  }

  // IMAGE
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(()=>cached);
      })
    );
    return;
  }

  // HTML / JS / CSS
  event.respondWith(
    fetch(event.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return res;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
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