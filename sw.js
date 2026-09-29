const CACHE_NAME = 'golviral-v12';
const IMAGE_CACHE = 'golviral-images-v12';
const APP_BASE_URL = 'https://golviral.com';

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

// Install - precache app shell only
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => 
      Promise.allSettled(PRECACHE_URLS.map(u => c.add(u).catch(()=>{})))
    )
  );
  self.skipWaiting();
});

// Activate - delete old caches + limit image cache
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => !k.includes('v12')).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Smart image cache cleaner - keep only 100 images max
async function limitImageCache() {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();
    if (keys.length > 100) {
      await cache.delete(keys[0]); // delete oldest
    }
  } catch {}
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // 1. NEVER INTERCEPT API, ADMIN, ONRENDER, OR NON-GET
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('onrender.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('admin.html') ||
    url.searchParams.has('nocache')
  ) {
    return; // go network directly, no SW
  }

  // 2. VIDEO = NETWORK ONLY (THIS FIXES REPETITION + CRASH)
  // Android TikTok feed should never cache video in SW
  const isVideo = 
    event.request.destination === 'video' ||
    url.pathname.includes('/media/') ||
    url.pathname.includes('/cdn/') ||
    url.pathname.match(/\.(mp4|mov|webm|m4v)$/i) ||
    event.request.headers.has('range');

  if (isVideo) {
    // Important: don't cache, just pass through
    // Let browser's native cache handle range
    event.respondWith(
      fetch(event.request).catch(() => {
        // offline fallback for video - return empty 503 so UI shows retry
        return new Response('', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // 3. IMAGES = STALE WHILE REVALIDATE (SMART)
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then(networkRes => {
          if (networkRes.status === 200) {
            cache.put(event.request, networkRes.clone());
            event.waitUntil(limitImageCache());
          }
          return networkRes;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4. APP SHELL / PAGES = CACHE FIRST THEN NETWORK
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Update in background
        event.waitUntil(
          fetch(event.request).then(res => {
            if (res.status === 200 && res.type === 'basic') {
              caches.open(CACHE_NAME).then(c => c.put(event.request, res));
            }
          }).catch(()=>{})
        );
        return cached;
      }
      return fetch(event.request).then(networkRes => {
        if (networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return networkRes;
      }).catch(() => {
        // Offline fallback
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match(`${APP_BASE_URL}/404.html`);
        }
      });
    })
  );
});

// DISABLE video prefetch - this was causing repetition
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // PREFETCH_VIDEO removed - don't cache videos
});

// Push notifications
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'GolViral';
  const options = {
    body: data.body || 'You have a new notification',
    icon: `${APP_BASE_URL}/icon-192.png`,
    badge: `${APP_BASE_URL}/icon-192.png`,
    data: data.data || { url: `/index.html#feed` },
    vibrate: [200, 100, 200],
    tag: data.type || 'general',
    renotify: true
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
        if (client.url.includes(APP_BASE_URL) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});