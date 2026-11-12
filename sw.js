// Caches the app shell so Skycast opens instantly and works offline (weather data still needs internet).
const CACHE = "skycast-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "effects.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  const ours = u.origin === location.origin || u.hostname === "cdnjs.cloudflare.com";
  if (e.request.method !== "GET" || !ours) return; // weather, radar and map tiles always go to the network
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => { caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => hit);
      return hit || net; // cached copy first, refreshed in the background
    })
  );
});
