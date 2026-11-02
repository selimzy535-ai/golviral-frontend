const CACHE_NAME = 'golviral-v12-fixed';
const APP_BASE_URL = 'https://golviral.com';
const PRECACHE_URLS = [
  `${APP_BASE_URL}/`,
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
// REMOVE index.html from precache - it's same as /

async function cleanResponseForSafari(res) {
  if (!res) return res;
  if (res.redirected || res.type === 'opaqueredirect') {
    const blob = await res.clone().blob();
    const headers = new Headers(res.headers);
    headers.delete('location');
    headers.delete('Location');
    return new Response(blob, { status: 200, statusText: 'OK', headers });
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
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.includes('sw.js') || url.pathname.includes('manifest.json') || url.hostname.includes('onrender.com') || url.pathname.startsWith('/api/') || url.pathname.includes('admin.html')) return;
  if (event.request.destination === 'video' || url.pathname.includes('/media/') || url.pathname.match(/\.(mp4|mov|webm|m4v)$/i)) return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    try {
      const networkResponse = await fetch(event.request, { redirect: 'follow' });
      const cleanRes = await cleanResponseForSafari(networkResponse);
      if (networkResponse.ok && networkResponse.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, cleanRes.clone());
      }
      return cleanRes;
    } catch {
      if (cached) return await cleanResponseForSafari(cached);
      throw new Error('offline');
    }
  })());
});