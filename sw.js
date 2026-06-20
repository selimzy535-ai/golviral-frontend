const CACHE_NAME = 'golviral-video-cache-v4.4';
const RUNTIME_CACHE = 'golviral-runtime-cache-v4.4';

// Assets to cache immediately on installation
const PRECACHE_ASSETS = [
    '/index.html',
    '/explore.html',
    '/reels.html',
    '/post.html',
    '/wallet.html',
    '/profile.html',
    '/auth.html',
    '/manifest.json',
    '/a2hs.js'
];

// Install Event - Pre-cache Shell Assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(RUNTIME_CACHE)
            .then(cache => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate Event - Clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME && cache !== RUNTIME_CACHE) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Intercept Network Fetches - Core PWA Cache & Size Gate Logic
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Filter rules: Handle streaming assets / video streams or large structural data files
    if (url.pathname.endsWith('.mp4') || url.pathname.endsWith('.m4v') || url.href.includes('backblazeb2.com') || url.href.includes('.b2')) {
        event.respondWith(handleVideoCachingAndGating(event.request));
        return;
    }

    // Default Runtime Network-First Strategy for Standard UI/API Requests
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(networkResponse => {
                // Cache a copy of structural web pages dynamically
                if (networkResponse.status === 200 && url.origin === self.location.origin) {
                    const responseClone = networkResponse.clone();
                    caches.open(RUNTIME_CACHE).then(cache => cache.put(event.request, responseClone));
                }
                return networkResponse;
            }).catch(() => {
                // Offline fallback if network fails
                return caches.match('/index.html');
            });
        })
    );
});

// Gated Interception Engine: Enforces Cache-First and 1.5MB hard cap limit to block large downloads
async function handleVideoCachingAndGating(request) {
    const videoCache = await caches.open(CACHE_NAME);
    const cachedResponse = await videoCache.match(request);

    // Rule 1: If cached natively, serve with zero bandwidth consumption cost
    if (cachedResponse) {
        return cachedResponse;
    }

    // Rule 2: If not cached, inspect headers before reading body content payload bytes
    try {
        const controller = new AbortController();
        const signal = controller.signal;

        const networkResponse = await fetch(request, { signal });

        // Extract the absolute byte dimension size of content
        const contentLength = networkResponse.headers.get('content-length');

        if (contentLength) {
            const sizeInBytes = parseInt(contentLength, 10);
            const maxAllowedBytes = 1.5 * 1024 * 1024; // 1.5MB limit rule

            if (sizeInBytes > maxAllowedBytes) {
                controller.abort(); // Immediately drop down the active transmission line socket pipeline connection
                return new Response(
                    JSON.stringify({ error: "File exceeded 1.5MB security ceiling limit. Action blocked." }),
                    { status: 403, headers: { 'Content-Type': 'application/json' } }
                );
            }
        }

        // Clone response stream data chunk buffer copy before consumption pipeline drains it
        const responseClone = networkResponse.clone();

        // Write directly asynchronously to local storage pool space persistently for future direct playback loops
        if (networkResponse.status === 200 || networkResponse.status === 206) {
            await videoCache.put(request, responseClone);
        }

        return networkResponse;

    } catch (err) {
        // Return a customized network fallback error status object signature structure layout template
        return new Response(
            JSON.stringify({ error: "Video distribution pipe network error or aborted transfer payload profile." }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
