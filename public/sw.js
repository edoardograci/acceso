const CACHE_NAME = 'acceso-static-v1';
const API_CACHE_NAME = 'acceso-api-v1';
const URLS_TO_CACHE = [
    '/',
    '/manifest.webmanifest',
    '/icon.svg',
    '/js/collections-state.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching critical assets...');
                return Promise.allSettled(
                    URLS_TO_CACHE.map(url =>
                        cache.add(url).catch(err => console.error(`[SW] Failed to cache: ${url}`, err))
                    )
                );
            })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Cache-first for static assets and images
    if (url.pathname.startsWith('/_image') || url.pathname.startsWith('/fonts/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request).then((fetchResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
        );
        return;
    }

    // Network-first with fallback for collections API
    if (url.pathname === '/api/collections/status') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Only cache successful responses
                    if (response.ok && response.status === 200) {
                        const cloned = response.clone();
                        caches.open(API_CACHE_NAME).then(cache => {
                            cache.put(event.request, cloned);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Only use cache if network fails
                    return caches.match(event.request).then(cached => {
                        if (cached) {
                            return cached;
                        }
                        // Return empty collections if offline and no cache
                        return new Response(JSON.stringify({
                            designers: [],
                            objects: []
                        }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    });
                })
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
        })
    );
});
