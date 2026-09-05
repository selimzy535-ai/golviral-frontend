const CACHE_NAME = 'golviral-v12'; // bumped - must be new version
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
      Promise.all(keys.filter(k => k!== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// FETCH - VIDEO IS COMPLETELY BYPASSED
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. NEVER TOUCH: API, VIDEOS, HLS, TELEGRAM, B2, ANY MEDIA
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('onrender.com') ||
    url.hostname.includes('backblazeb2.com') ||
    url.hostname.includes('telegram.org') ||
    url.hostname.includes('cdn-') ||
    url.href.includes('.m3u8') ||
    url.href.includes('.ts') ||
    url.href.includes('.mp4') ||
    url.href.includes('.mov') ||
    url.href.includes('.webm') ||
    url.href.includes('.m4v') ||
    url.href.includes('video') ||
    event.request.destination === 'video' ||
    event.request.destination === 'audio'
  ) {
    return; // let browser handle directly, SW does nothing
  }

  // 2. IMAGES: Cache first (safe)
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(()=> cached)
      )
    );
    return;
  }

  // 3. APP SHELL: Cache first for offline PWA
  if (url.origin === APP_BASE_URL && url.pathname.startsWith(APP_FOLDER)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(()=> caches.match(`${APP_BASE_URL}${APP_FOLDER}/index.html`));
      })
    );
  }
});

// PUSH
self.addEventListener('push', event => {
  const data = event.data? event.data.json() : {};
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