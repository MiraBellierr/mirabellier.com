const STATIC_CHUNK_CACHE = "mirabellier-static-chunks-v20260624";

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
