/* Helganator service worker – offline cache. */
const CACHE = "helganator-v16";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./planner.js",
  "./data.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// network-first: online MINDIG a friss verziót adja (és frissíti a cache-t),
// offline a cache-ből szolgál ki -> nincs többé beragadt régi verzió.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match("./index.html"))
    )
  );
});
