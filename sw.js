
const CACHE_NAME = 'bowltrack-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/bowling.js',
    '/js/offline-sync.js',
    '/js/push-notifications.js',
    '/js/api-client.js',
    '/js/app.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network first for API, cache first for static
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (request.url.startsWith('chrome-extension')) return;

    // API calls: Network first
    if (url.pathname.startsWith('/api/') || url.pathname === '/ws') {
        event.respondWith(
            fetch(request).catch(() => caches.match(request))
        );
        return;
    }

    // Static assets: Cache first
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) {
                fetch(request).then((response) => {
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
                }).catch(() => {});
                return cached;
            }
            return fetch(request).then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                return response;
            });
        })
    );
});

// Background Sync
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-games') {
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => client.postMessage({ type: 'SYNC_GAMES' }));
            })
        );
    }
});

// Push Notifications
self.addEventListener('push', (event) => {
    if (!event.data) return;
    const data = event.data.json();
    const options = {
        body: data.body || 'Someone just beat their score!',
        icon: '/assets/icon-192.png',
        badge: '/assets/icon-192.png',
        tag: data.tag || 'score-beaten',
        requireInteraction: true,
        data: data.payload || {},
        actions: [
            { action: 'open', title: 'Open App' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };
    event.waitUntil(self.registration.showNotification(data.title || 'BowlTrack', options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            if (clients.length > 0) {
                clients[0].focus();
                clients[0].postMessage({ type: 'NOTIFICATION_CLICK', payload: event.notification.data });
            } else {
                self.clients.openWindow('/');
            }
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
