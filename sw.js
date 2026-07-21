// --- CONFIGURATION & CACHE KEYS ---
const CACHE_NAME = 'golviral-v6-cache';
const VIDEO_CACHE_NAME = 'golviral-v6-video-cache';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/auth.html',
  '/profile.html',
  '/messages.html',
  '/post.html'
];

// Helper: Check if request URL target is video media or B2 storage
function isVideoRequest(url) {
  return (
    url.includes('backblazeb2.com') ||
    url.includes('b2') ||
    /\.(mp4|mov|quicktime|webm|m4v)(\?.*)?$/i.test(url)
  );
}

// --- 1. ON INSTALL ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// --- ACTIVATION & CLEANUP ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache !== VIDEO_CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// --- 2. ON FETCH ---
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = request.url;

  // Skip non-GET requests for caching
  if (request.method !== 'GET') return;

  // A. API Requests -> Network First with Cache Fallback
  if (url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // B. Video Cache (B2 Storage & Videos) -> 24-Hour TTL Caching
  if (isVideoRequest(url)) {
    event.respondWith(
      caches.open(VIDEO_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
          const fetchedAt = cachedResponse.headers.get('sw-fetched-at');
          const isFresh = fetchedAt && (Date.now() - parseInt(fetchedAt, 10) < TWENTY_FOUR_HOURS_MS);
          
          if (isFresh) {
            return cachedResponse;
          }
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 206)) {
            // Reconstruct response with a timestamp header for 24h expiration check
            const headers = new Headers(networkResponse.headers);
            headers.set('sw-fetched-at', Date.now().toString());

            const blob = await networkResponse.blob();
            const customResponse = new Response(blob, {
              status: networkResponse.status,
              statusText: networkResponse.statusText,
              headers: headers
            });

            cache.put(request, customResponse.clone());
            return customResponse;
          }
          return networkResponse;
        } catch (err) {
          return cachedResponse || Promise.reject(err);
        }
      })
    );
    return;
  }

  // C. Static Resources -> Cache First with Network Fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});

// --- 3. ON PUSH ---
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'GolViral';
    const options = {
      body: data.body || '',
      icon: '/icon-192.png'
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('Error handling push notification:', err);
  }
});

// --- 4. ON NOTIFICATIONCLICK ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
