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

// Safe Safari response cleaner using blob() to prevent WebKit internal errors & redirects
async function cleanResponseForSafari(res) {
  if (!res) return res;
  if (res.redirected || res.type === 'opaqueredirect') {
    try {
      const blob = await res.blob();
      return new Response(blob, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers
      });
    } catch (e) {
      return res;
    }
  }
  return res;
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      Promise.allSettled(
        PRECACHE_URLS.map(u =>
          fetch(u).then(async res => {
            if (res.ok) {
              const cleaned = await cleanResponseForSafari(res);
              return c.put(u, cleaned);
            }
          }).catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
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
      const cachedTime = dateHeader ? new Date(dateHeader).getTime() : now;
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
    method !== 'GET' ||
    url.pathname.includes('sw.js') ||
    url.pathname.includes('manifest.json') ||
    url.hostname.includes('onrender.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('admin.html')
  ) {
    return; // FIX: was respondWith(fetch) - caused double respond
  }

  if (event.request.destination === 'video' || url.pathname.includes('/media/') || url.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) {
    return; // FIX: Video bypass - no caching, instant streaming
  }

  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(async cached => {
        if (cached) return await cleanResponseForSafari(cached);

        try {
          const res = await fetch(event.request);
          const cleanRes = await cleanResponseForSafari(res);
          if (res && res.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, cleanRes.clone());
          }
          return cleanRes;
        } catch (err) {
          return cached ? await cleanResponseForSafari(cached) : Response.error();
        }
      })
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);

      try {
        const networkResponse = await fetch(event.request);
        const cleanRes = await cleanResponseForSafari(networkResponse);
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, cleanRes.clone());
        }
        return cleanRes;
      } catch (err) {
        if (cached) {
          return await cleanResponseForSafari(cached);
        }
        throw err;
      }
    })()
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PREFETCH_VIDEO') {
    const url = event.data.url;
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(url);
      if (!cached) {
        try {
          const res = await fetch(url);
          if (res && res.status === 200) {
            const cleanRes = await cleanResponseForSafari(res);
            cache.put(url, cleanRes);
          }
        } catch (e) {}
      }
    });
  }
  
  // NEW - ADD THIS PART
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const title = event.data.title || 'GolViral';
    const options = {
      body: event.data.body || 'New activity',
      icon: `${APP_BASE_URL}/icon-192.png`,
      badge: `${APP_BASE_URL}/icon-192.png`,
      vibrate: [200, 100, 200],
      tag: event.data.tag || Date.now().toString(),
      data: { url: event.data.url || '/profile.html' }
    };
    self.registration.showNotification(title, options);
  }
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
