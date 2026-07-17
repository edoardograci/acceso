const CACHE_NAME = 'acceso-static-v4';
const API_CACHE_NAME = 'acceso-api-v4';
const URL_CACHE_EXCLUDES = ['/api/', '/js/', '/css/'];

const URLS_TO_CACHE = [
    '/',
    '/manifest.webmanifest?v=2',
    '/icon.svg?v=2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return Promise.allSettled(
                    URLS_TO_CACHE.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`[SW] Failed to cache: ${url}`, err);
                            return null;
                        })
                    )
                );
            })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip external
    if (!url.origin.includes(self.location.origin) || url.hostname.includes('posthog.com')) {
        return;
    }

    // Network-First for JS, CSS, and API to allow instant updates
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-First for static assets (images, fonts)
    if (url.pathname.startsWith('/_image') || url.pathname.startsWith('/fonts/')) {
        event.respondWith(
            caches.match(event.request)
                .then((response) => response || fetch(event.request)
                    .then((fetchRes) => {
                        if (fetchRes.status === 200) {
                            const clone = fetchRes.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                        }
                        return fetchRes;
                    })
                )
        );
        return;
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});