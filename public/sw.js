const STATIC_CHUNK_CACHE = "mirabellier-static-chunks-v20260502";

function isCacheableStaticChunk(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return false;
  }

  if (!url.pathname.startsWith("/assets/")) {
    return false;
  }

  return request.destination === "script" || request.destination === "style";
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith("mirabellier-") &&
              cacheName !== STATIC_CHUNK_CACHE,
          )
          .map((cacheName) => caches.delete(cacheName)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (!isCacheableStaticChunk(request)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CHUNK_CACHE);
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        void fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              return cache.put(request, networkResponse.clone());
            }
          })
          .catch(() => {});

        return cachedResponse;
      }

      const networkResponse = await fetch(request);

      if (networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
      }

      return networkResponse;
    })(),
  );
});
