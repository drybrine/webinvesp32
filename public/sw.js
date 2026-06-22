const CACHE_NAME = 'stokmanager-v3'
const FIREBASE_CACHE_NAME = 'firebase-cache-v3'
const FIREBASE_CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

const urlsToCache = [
  '/manifest.json',
  '/placeholder-logo.png',
  '/placeholder-logo.svg',
]

// Firebase domains to cache (static assets only — RTDB realtime traffic is excluded below)
const FIREBASE_DOMAINS = [
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com'
]

// Realtime database hosts that must NEVER be cached (long-polling, WS upgrade, snapshots)
const FIREBASE_REALTIME_HOSTS = [
  'firebasedatabase.app',
  'firebaseio.com'
]

// Check if URL is a realtime database request (must always hit network)
const isFirebaseRealtime = (url) => {
  return FIREBASE_REALTIME_HOSTS.some(host => url.includes(host))
}

// Check if URL is from Firebase
const isFirebaseResource = (url) => {
  return FIREBASE_DOMAINS.some(domain => url.includes(domain))
}

const isStaticAsset = (request) => {
  const url = new URL(request.url)
  return request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname === '/manifest.json'
}

const networkFirst = async (request) => {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache)
      })
  )
  self.skipWaiting()
})

// Fetch event with Firebase caching
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Realtime Database: always hit network, never cache, never intercept
  if (isFirebaseRealtime(url.href)) {
    return
  }

  // API calls: always network, never cache
  if (request.url.includes('/api/')) {
    return
  }

  // Handle Firebase resources with custom caching
  if (isFirebaseResource(url.href)) {
    event.respondWith(
      caches.open(FIREBASE_CACHE_NAME).then(async (cache) => {
        // Try to get from cache first
        const cachedResponse = await cache.match(request)

        if (cachedResponse) {
          // Check if cache is still valid
          const cachedTime = cachedResponse.headers.get('sw-cached-time')
          if (cachedTime) {
            const age = Date.now() - parseInt(cachedTime)
            if (age < FIREBASE_CACHE_DURATION) {
              // Return cached response if still valid
              return cachedResponse
            }
          }
        }

        // Fetch from network
        try {
          const networkResponse = await fetch(request)

          // Clone the response
          const responseToCache = networkResponse.clone()

          // Add custom header with cache time
          const headers = new Headers(responseToCache.headers)
          headers.append('sw-cached-time', Date.now().toString())

          // Create new response with custom headers
          const modifiedResponse = new Response(responseToCache.body, {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers: headers
          })

          // Cache the response
          if (networkResponse.status === 200) {
            cache.put(request, modifiedResponse.clone())
          }

          return networkResponse
        } catch (error) {
          // If network fails, return cached response if available
          if (cachedResponse) {
            console.log('Network failed, returning cached Firebase resource')
            return cachedResponse
          }
          throw error
        }
      })
    )
    return
  }

  if (!request.url.startsWith(self.location.origin)) {
    return
  }

  // Documents, scripts, and styles must be network-first so deploys do not serve stale chunks.
  if (request.mode === 'navigate' || request.destination === 'document' ||
      request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirst(request))
    return
  }

  // Static app assets can remain cache-first.
  if (isStaticAsset(request)) {
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) return response
          return fetch(request).then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response
            }
            const responseToCache = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache)
            })
            return response
          })
        })
    )
    return
  }

  event.respondWith(networkFirst(request))
})

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== FIREBASE_CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Periodic Firebase cache cleanup
setInterval(() => {
  caches.open(FIREBASE_CACHE_NAME).then(async (cache) => {
    const requests = await cache.keys()

    requests.forEach(async (request) => {
      const response = await cache.match(request)
      if (response) {
        const cachedTime = response.headers.get('sw-cached-time')
        if (cachedTime) {
          const age = Date.now() - parseInt(cachedTime)
          if (age > FIREBASE_CACHE_DURATION) {
            cache.delete(request)
          }
        }
      }
    })
  })
}, 60 * 60 * 1000) // Run every hour
