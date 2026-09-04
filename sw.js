const CACHE_NAME = 'golviral-v11'; // bumped
const APP_BASE_URL = 'https://selimzy535-ai.github.io';
const APP_FOLDER = '/golviral-frontend';

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
      Promise.allSettled(PRECACHE_URLS.map(u => c.add(u).catch(()=>{})))
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

// FETCH - FIXED: Never block video/HLS/sign
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // BYPASS: API, CDN, HLS, Signed URLs, Videos - let browser handle
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('onrender.com') ||
    url.hostname.includes('backblazeb2.com') ||
    url.hostname.includes('telegram') ||
    url.href.includes('.m3u8') ||
    url.href.includes('.ts') ||
    url.href.includes('.mp4') ||
    url.href.includes('.mov') ||
    url.href.includes('.webm') ||
    url.search.includes('token') ||
    url.search.includes('Expires') ||
    url.search.includes('Signature') ||
    event.request.destination === 'video'
  ) {
    return; // DO NOT call respondWith = bypass SW
  }

  // IMAGES: Cache first
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          if (res.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
          }
          return res;
        }).catch(()=> cached)
      )
    );
    return;
  }

  // APP SHELL: Cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.ok && url.href.startsWith(APP_BASE_URL + APP_FOLDER)) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise.then(res => res || caches.match(`${APP_BASE_URL}${APP_FOLDER}/index.html`));
    })
  );
});

// PUSH - Keep your working code
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

// CLICK
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