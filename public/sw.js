const CACHE_NAME = "zynth-pwa-shell-v2";
const OFFLINE_URL = "/offline.html";
const NAVIGATION_TIMEOUT_MS = 8000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("zynth-pwa-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirstNavigation(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);

  try {
    const response = await fetch(request, { signal: controller.signal, cache: "no-store" });
    if (response.ok) return response;

    if (response.status >= 500) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return response;
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw new Error("ZYNTH navigation unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirstNavigation(request));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  const title = data.title || "ZYNTH";
  const options = {
    body: data.body || "You have a new ZYNTH notification.",
    icon: data.icon || "/icons/zynth-icon.svg",
    badge: data.badge || "/icons/zynth-icon.svg",
    tag: data.tag || "zynth-notification",
    renotify: true,
    silent: false,
    data: { url: data.url || "/dashboard/notifications" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard/notifications";

  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of list) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(target);
  })());
});