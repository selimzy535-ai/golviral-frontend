const CACHE_NAME = 'golviral-v12'; // BUMPED - this deletes the old broken v11 redirects
const APP_BASE_URL = 'https://golviral.com';

const PRECACHE_URLS = [
  `${APP_BASE_URL}/manifest.json`,
  `${APP_BASE_URL}/icon-192.png`,
  `${APP_BASE_URL}/icon-512.png`
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      for (const u of PRECACHE_URLS) {
        try {
          const res = await fetch(u, { cache: 'no-cache' });
          if (res && res.ok) await c.put(u, res.clone());
        } catch {}
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k).then(() => {}).catch(()=>{})))
      // DELETE ALL OLD CACHES - this is what fixes the redirection error
    ).then(() => caches.open(CACHE_NAME)).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. NEVER handle these
  if (
    event.request.method !== 'GET' ||
    url.pathname.includes('sw.js') ||
    url.pathname.includes('manifest.json') ||
    url.hostname.includes('onrender.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('admin.html')
  ) return;

  // 2. VIDEO - bypass completely (no respondWith)
  if (event.request.destination === 'video' || url.pathname.includes('/media/') || url.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) {
    return;
  }

  // 3. CRITICAL FIX FOR CLOUDFLARE PAGES: For navigation (HTML pages), DO NOT use cache at all
  // Just go to network. This stops "Response has redirection" forever
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html') || caches.match(`${APP_BASE_URL}/index.html`))
    );
    return;
  }

  // 4. Images - cache first, but NEVER store a redirect
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then(async cached => {
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res.ok && !res.redirected && res.type !== 'opaqueredirect') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, res.clone());
          }
          return res;
        } catch { return cached; }
      })
    );
    return;
  }

  // 5. Everything else - network first, clone safely
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(event.request);
        // If Cloudflare redirected, create a CLEAN response without redirect flag
        if (res.redirected) {
          const body = await res.clone().blob();
          return new Response(body, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
          });
        }
        return res;
      } catch {
        return caches.match(event.request);
      }
    })()
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PREFETCH_VIDEO') {
    return; // don't cache video anymore
  }
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title || 'GolViral', {
      body: event.data.body || 'New activity',
      icon: `${APP_BASE_URL}/icon-192.png`,
      badge: `${APP_BASE_URL}/icon-192.png`,
      vibrate: [200, 100, 200],
      tag: event.data.tag || Date.now().toString(),
      data: { url: event.data.url || '/profile' }
    });
  }
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'GolViral', {
      body: data.body || 'You have a new notification',
      icon: `${APP_BASE_URL}/icon-192.png`,
      badge: `${APP_BASE_URL}/icon-192.png`,
      data: data.data || { url: `/` },
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data?.url || '/', APP_BASE_URL).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url.includes(APP_BASE_URL) && 'focus' in c) return c.focus(); }
      return clients.openWindow(urlToOpen);
    })
  );
});