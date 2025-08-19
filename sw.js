/*
 * Service Worker for Real Estate Management App
 * Author: Jules
 * Date: 2025-08-19
 * Description: PWA service worker for offline functionality and caching
 */

const CACHE_NAME = 'estate-management-v4.0';
const STATIC_CACHE = 'estate-static-v4.0';
const DYNAMIC_CACHE = 'estate-dynamic-v4.0';

// Files to cache for offline functionality
const STATIC_FILES = [
    '/',
    '/index.html',
    '/app.js',
    '/db.js',
    '/style.css',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js',
    'https://unpkg.com/htmx.org@1.9.10',
    'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js'
];

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('Service Worker: Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('Service Worker: Static files cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Error caching static files:', error);
            })
    );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Remove old caches
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated successfully');
                return self.clients.claim();
            })
            .catch((error) => {
                console.error('Service Worker: Error during activation:', error);
            })
    );
});

// ===== FETCH EVENT =====
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Handle different types of requests
    if (url.origin === self.location.origin) {
        // Local files
        event.respondWith(handleLocalRequest(request));
    } else {
        // External resources (CDN)
        event.respondWith(handleExternalRequest(request));
    }
});

// ===== REQUEST HANDLERS =====

/**
 * Handle local file requests
 * @param {Request} request - The fetch request
 * @returns {Promise<Response>} The response
 */
async function handleLocalRequest(request) {
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful responses
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
    } catch (error) {
        console.log('Service Worker: Network failed, trying cache:', error);
    }
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Return offline page for HTML requests
    if (request.headers.get('accept').includes('text/html')) {
        return caches.match('/index.html');
    }
    
    // Return 404 for other requests
    return new Response('Not found', { status: 404 });
}

/**
 * Handle external resource requests (CDN)
 * @param {Request} request - The fetch request
 * @returns {Promise<Response>} The response
 */
async function handleExternalRequest(request) {
    try {
        // Try cache first for external resources
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Try network
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful responses
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
    } catch (error) {
        console.log('Service Worker: External resource fetch failed:', error);
    }
    
    // Return offline response for failed external requests
    return new Response('Offline', { status: 503 });
}

// ===== CACHE MANAGEMENT =====

/**
 * Clear all caches
 * @returns {Promise<void>}
 */
async function clearAllCaches() {
    const cacheNames = await caches.keys();
    return Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
}

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache statistics
 */
async function getCacheStats() {
    const cacheNames = await caches.keys();
    const stats = {};
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        stats[cacheName] = keys.length;
    }
    
    return stats;
}

// ===== MESSAGE HANDLING =====
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CLEAR_CACHES':
            clearAllCaches()
                .then(() => {
                    event.ports[0].postMessage({ success: true });
                })
                .catch((error) => {
                    event.ports[0].postMessage({ success: false, error: error.message });
                });
            break;
            
        case 'GET_CACHE_STATS':
            getCacheStats()
                .then((stats) => {
                    event.ports[0].postMessage({ success: true, stats });
                })
                .catch((error) => {
                    event.ports[0].postMessage({ success: false, error: error.message });
                });
            break;
            
        case 'UPDATE_CACHE':
            // Force update of static files
            caches.open(STATIC_CACHE)
                .then((cache) => {
                    return cache.addAll(STATIC_FILES);
                })
                .then(() => {
                    event.ports[0].postMessage({ success: true });
                })
                .catch((error) => {
                    event.ports[0].postMessage({ success: false, error: error.message });
                });
            break;
            
        default:
            console.log('Service Worker: Unknown message type:', type);
    }
});

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync triggered:', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(performBackgroundSync());
    }
});

/**
 * Perform background synchronization
 * @returns {Promise<void>}
 */
async function performBackgroundSync() {
    try {
        // Perform any background tasks here
        console.log('Service Worker: Performing background sync...');
        
        // Example: Update cache
        await updateCache();
        
        console.log('Service Worker: Background sync completed');
    } catch (error) {
        console.error('Service Worker: Background sync failed:', error);
    }
}

/**
 * Update cache with new files
 * @returns {Promise<void>}
 */
async function updateCache() {
    const cache = await caches.open(STATIC_CACHE);
    
    // Add new files to cache
    for (const file of STATIC_FILES) {
        try {
            await cache.add(file);
        } catch (error) {
            console.log('Service Worker: Failed to cache file:', file, error);
        }
    }
}

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
    console.log('Service Worker: Push notification received');
    
    const options = {
        body: event.data ? event.data.text() : 'تحديث جديد متاح',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'فتح التطبيق',
                icon: '/icon-192x192.png'
            },
            {
                action: 'close',
                title: 'إغلاق',
                icon: '/icon-192x192.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('مدير الاستثمار العقاري', options)
    );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// ===== ERROR HANDLING =====
self.addEventListener('error', (event) => {
    console.error('Service Worker: Error occurred:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker: Unhandled promise rejection:', event.reason);
});

// ===== UTILITY FUNCTIONS =====

/**
 * Check if request is for static file
 * @param {Request} request - The request to check
 * @returns {boolean} True if static file
 */
function isStaticFile(request) {
    const url = new URL(request.url);
    const staticExtensions = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg'];
    
    return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

/**
 * Check if request is for external resource
 * @param {Request} request - The request to check
 * @returns {boolean} True if external resource
 */
function isExternalResource(request) {
    const url = new URL(request.url);
    return url.origin !== self.location.origin;
}

// ===== DEBUGGING =====
if (process.env.NODE_ENV === 'development') {
    self.addEventListener('install', (event) => {
        console.log('Service Worker: Development mode - skipping waiting');
        self.skipWaiting();
    });
}
