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

// Helper to clean responses for Safari/Cloudflare Pages
async function cleanResponseForSafari(res) {
  if (!res) return res;
  if (res.redirected || res.type === 'opaqueredirect') {
    const blob = await res.clone().blob();
    return new Response(blob, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers
    });
  }
  return res;
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      for (const u of PRECACHE_URLS) {
        try {
          const res = await fetch(u, { redirect: 'follow' });
          if (res && res.ok) {
            const clean = await cleanResponseForSafari(res);
            await c.put(u, clean.clone());
          }
        } catch {}
      }
    })
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
      if (now - cachedTime > MAX_AGE) await cache.delete(req);
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
  ) return;

  if (event.request.destination === 'video' || url.pathname.includes('/media/') || url.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) return;

  if (event.request.destination === 'image') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached) {
          return await cleanResponseForSafari(cached);
        }
        const res = await fetch(event.request, { redirect: 'follow' });
        const clean = await cleanResponseForSafari(res);
        if (res.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, clean.clone());
        }
        return clean;
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      try {
        const networkResponse = await fetch(event.request, { redirect: 'follow' });
        const cleanRes = await cleanResponseForSafari(networkResponse);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, cleanRes.clone());
        }
        return cleanRes;
      } catch {
        if (cached) return await cleanResponseForSafari(cached);
      }
      if (cached) return await cleanResponseForSafari(cached);
    })()
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PREFETCH_VIDEO') {
    const url = event.data.url;
    caches.open(CACHE_NAME).then(cache => {
      cache.match(url).then(cached => {
        if (!cached) {
          fetch(url).then(async res => {
            if (res && res.status === 200) {
              const clean = await cleanResponseForSafari(res);
              cache.put(url, clean);
            }
          }).catch(() => {});
        }
      });
    });
  }
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