// Service Worker for instant repeat visits and offline support
const CACHE_VERSION = "v2";
const CACHE_NAME = `mirabellier-${CACHE_VERSION}`;
const EXTERNAL_CACHE_NAME = `mirabellier-external-${CACHE_VERSION}`;
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days for external resources

// Critical assets to cache immediately
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/src/assets/light.jpg",
  "/src/assets/dark.jpg",
];

// External domains to cache with long lifetime
const EXTERNAL_CACHEABLE_DOMAINS = [
  "media1.tenor.com",
  "cdn.myanimelist.net",
  "i.pinimg.com",
  "get.pxhere.com",
];

// Install event - cache critical assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }),
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith("mirabellier-") &&
              name !== CACHE_NAME &&
              name !== EXTERNAL_CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

// Fetch event - serve from cache, then network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-http(s) schemes (e.g., chrome-extension) to avoid cache.put errors
  if (!/^https?:$/.test(url.protocol)) return;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API calls (always fresh)
  if (request.url.includes("/api/")) return;

  // Handle external images with long cache lifetime
  const isExternalImage =
    EXTERNAL_CACHEABLE_DOMAINS.includes(url.hostname) &&
    request.url.match(/\.(jpg|jpeg|png|gif|webp|avif)$/i);

  if (isExternalImage) {
    event.respondWith(
      caches.open(EXTERNAL_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          // Check if cached response is still fresh (7 days)
          if (cachedResponse) {
            const cachedDate = cachedResponse.headers.get("sw-cached-date");
            if (cachedDate) {
              const age = Date.now() - new Date(cachedDate).getTime();
              if (age < CACHE_DURATION) {
                return cachedResponse;
              }
            } else {
              // No date header, still use it but refetch in background
              event.waitUntil(
                fetch(request)
                  .then((response) => {
                    if (response.ok) {
                      const headers = new Headers(response.headers);
                      headers.set("sw-cached-date", new Date().toISOString());
                      return response.blob().then((blob) => {
                        cache.put(
                          request,
                          new Response(blob, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: headers,
                          }),
                        );
                      });
                    }
                  })
                  .catch(() => {}),
              );
              return cachedResponse;
            }
          }

          // Fetch from network with custom cache header
          return fetch(request)
            .then((response) => {
              if (response.ok) {
                const headers = new Headers(response.headers);
                headers.set("sw-cached-date", new Date().toISOString());

                return response.blob().then((blob) => {
                  const cachedResponse = new Response(blob, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: headers,
                  });
                  cache.put(request, cachedResponse.clone());
                  return cachedResponse;
                });
              }
              return response;
            })
            .catch(() => cachedResponse || new Response("", { status: 404 }));
        });
      }),
    );
    return;
  }

  // Handle own assets - stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // Return cached version if available
      if (cachedResponse) {
        // Update cache in background
        event.waitUntil(
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
          }),
        );
        return cachedResponse;
      }

      // Fetch from network and cache
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      });
    }),
  );
});
