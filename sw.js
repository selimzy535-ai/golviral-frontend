const CACHE_NAME = 'golviral-v9'; // bumped for root deploy
const APP_BASE_URL = 'https://selimzy535-ai.github.io'; // ROOT - no subfolder
const APP_FOLDER = '/golviral-frontend'; // your app is still in this folder

const PRECACHE_URLS = [
  `${APP_BASE_URL}${APP_FOLDER}/`,
  `${APP_BASE_URL}${APP_FOLDER}/index.html`,
  `${APP_BASE_URL}${APP_FOLDER}/auth.html`,
  `${APP_BASE_URL}${APP_FOLDER}/post.html`,
  `${APP_BASE_URL}${APP_FOLDER}/messages.html`,
  `${APP_BASE_URL}${APP_FOLDER}/kyc.html`,
  `${APP_BASE_URL}${APP_FOLDER}/manifest.json`,
  `${APP_BASE_URL}${APP_FOLDER}/icon-192.png`,
  `${APP_BASE_URL}${APP_FOLDER}/icon-512.png`
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => 
      Promise.allSettled(PRECACHE_URLS.map(u => c.add(u).catch(() => {})))
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

// Throttled cleanup helper to avoid race conditions on high concurrency
let isCleaning = false;
async function cleanupOldVideos() {
  if (isCleaning) return;
  isCleaning = true;
  try {
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
  } catch (err) {
    console.error("Cleanup failed", err);
  } finally {
    isCleaning = false;
  }
}

// Helper to construct artificial 206 responses from a cached 200 response for Safari compatibility
async function returnRangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return cachedResponse;

  const arrayBuffer = await cachedResponse.arrayBuffer();
  const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
  if (!match) return cachedResponse;

  const totalLength = arrayBuffer.byteLength;
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : totalLength - 1;
  const slicedBuffer = arrayBuffer.slice(start, end + 1);

  const responseHeaders = new Headers(cachedResponse.headers);
  responseHeaders.set('Content-Range', `bytes ${start}-${end}/${totalLength}`);
  responseHeaders.set('Content-Length', slicedBuffer.byteLength);
  responseHeaders.set('Accept-Ranges', 'bytes');

  return new Response(slicedBuffer, {
    status: 206,
    statusText: 'Partial Content',
    headers: responseHeaders
  });
}

// FETCH
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  // 0. BYPASS: API calls, Admin page, non-GET requests
  if (
    method !== 'GET' ||
    url.hostname.includes('onrender.com') || 
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('admin.html')
  ) {
    return; // Fall back to default browser fetch handling
  }

  // 1. VIDEOS: Cache First with Range Request support
  if (event.request.destination === 'video' || url.pathname.includes('/media/') || url.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request.url);
        if (cached) {
          return returnRangeResponse(event.request, cached);
        }

        try {
          const fetchRequest = event.request.headers.has('range') 
            ? new Request(event.request.url, { headers: { 'Accept': '*/*' } }) 
            : event.request;

          const networkRes = await fetch(fetchRequest);
          if (networkRes.status === 200) {
            cache.put(event.request.url, networkRes.clone());
            event.waitUntil(cleanupOldVideos());
            return returnRangeResponse(event.request, networkRes);
          }
          return networkRes;
        } catch {
          if (cached) return returnRangeResponse(event.request, cached);
        }
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

  // 3. APP SHELL: Stale While Revalidate
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

// BACKGROUND PREFETCH
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PREFETCH_VIDEO') {
    const url = event.data.url;
    caches.open(CACHE_NAME).then(cache => {
      cache.match(url).then(cached => {
        if (!cached) {
          fetch(url).then(res => {
            if (res.status === 200) {
              cache.put(url, res);
              event.waitUntil(cleanupOldVideos());
            }
          }).catch(() => {});
        }
      });
    });
  }
});

// PUSH: Show notification
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'GolViral';
  const options = {
    body: data.body || 'You have a new notification',
    icon: `${APP_BASE_URL}${APP_FOLDER}/icon-192.png`,
    badge: `${APP_BASE_URL}${APP_FOLDER}/icon-192.png`,
    data: data.data || { url: `${APP_FOLDER}/index.html#feed` },
    vibrate: [200, 100, 200],
    tag: data.type || 'general'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// NOTIFICATION CLICK: Open app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const relativeUrl = event.notification.data?.url || `${APP_FOLDER}/index.html#feed`;
  const urlToOpen = new URL(relativeUrl.replace(/^\//, ''), `${APP_BASE_URL}/`).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

