const STATIC_CHUNK_CACHE = "mirabellier-static-chunks-v20260624";
// The cache name never changes across deploys (see `activate` below, which
// only clears caches with a *different* name), so nothing ever evicts old
// builds' chunks on its own — cap it and drop the oldest entries instead.
const STATIC_CHUNK_CACHE_MAX_ENTRIES = 200;

async function putInCache(cache, request, response) {
  try {
    await cache.put(request, response);
  } catch {
    // A full/blocked cache quota must not fail the actual network response.
    return;
  }

  const keys = await cache.keys();
  const overflow = keys.length - STATIC_CHUNK_CACHE_MAX_ENTRIES;
  if (overflow > 0) {
    await Promise.all(
      keys.slice(0, overflow).map((key) => cache.delete(key)),
    );
  }
}

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
  // Don't skip waiting automatically — keep existing pages stable.
  // New tabs will pick up the updated service worker on next navigation.
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
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
              return putInCache(cache, request, networkResponse.clone());
            }
          })
          .catch(() => {});

        return cachedResponse;
      }

      const networkResponse = await fetch(request);

      if (networkResponse.ok) {
        await putInCache(cache, request, networkResponse.clone());
      }

      return networkResponse;
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Twitch notification";
  const options = {
    body: payload.body || "",
    icon: "/favicon.jpg",
    badge: "/favicon.jpg",
    data: { url: payload.url || "/twitch" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/twitch";

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            client.navigate(targetUrl);
            return;
          }
        }
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});
