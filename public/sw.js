// Service Worker for instant repeat visits and offline support
const CACHE_VERSION = "v8";
const CACHE_NAME = `mirabellier-${CACHE_VERSION}`;
const EXTERNAL_CACHE_NAME = `mirabellier-external-${CACHE_VERSION}`;
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days for external resources

// Critical assets to cache immediately
const PRECACHE_ASSETS = [
  "/light.jpg",
  "/dark.jpg",
];

// External domains to cache with long lifetime
const EXTERNAL_CACHEABLE_DOMAINS = [
  "media1.tenor.com",
  "cdn.myanimelist.net",
  "i.pinimg.com",
  "get.pxhere.com",
];

function hasNoStoreDirective(value) {
  return /\bno-store\b/i.test(String(value || ""));
}

function isRealtimeDataRequest(url) {
  return /^\/(?:api\/)?(?:posts(?:\/|$)|quote-of-the-day(?:\/|$))/.test(
    url.pathname,
  );
}

function shouldBypassCache(request, url) {
  return (
    request.cache === "no-store" ||
    hasNoStoreDirective(request.headers.get("Cache-Control")) ||
    isRealtimeDataRequest(url)
  );
}

function shouldCacheResponse(response) {
  if (!response || response.status !== 200) {
    return false;
  }

  return !hasNoStoreDirective(response.headers.get("Cache-Control"));
}

function fetchFresh(request) {
  return fetch(new Request(request, { cache: "no-store" }));
}

function offlineResponse() {
  return new Response("", { status: 503, statusText: "Offline" });
}

function cacheNavigationShell(response) {
  if (!shouldCacheResponse(response)) {
    return Promise.resolve();
  }

  return caches.open(CACHE_NAME).then((cache) =>
    Promise.all([
      cache.put("/", response.clone()),
      cache.put("/index.html", response.clone()),
    ]),
  );
}

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

  // Always try to fetch navigations from the network first so route/layout
  // changes do not get masked by a stale cached app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetchFresh(request)
        .then((networkResponse) => {
          event.waitUntil(cacheNavigationShell(networkResponse.clone()));
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match("/")) ||
            (await cache.match("/index.html")) ||
            offlineResponse()
          );
        }),
    );
    return;
  }

  if (shouldBypassCache(request, url)) {
    event.respondWith(
      fetchFresh(request).catch(async () => {
        const cachedResponse = await caches.match(request);
        return cachedResponse || offlineResponse();
      }),
    );
    return;
  }

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
              if (response.ok && shouldCacheResponse(response)) {
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
          fetch(request)
            .then((networkResponse) => {
              if (shouldCacheResponse(networkResponse)) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse.clone());
                });
              }
            })
            .catch(() => {}),
        );
        return cachedResponse;
      }

      // Fetch from network and cache
      return fetch(request)
        .then((networkResponse) => {
          if (shouldCacheResponse(networkResponse)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const fallback = await caches.match(request);
          return fallback || offlineResponse();
        });
    }),
  );
});
