// Bump this on every deploy that changes index.html/manifest/icons — it's what makes the
// activate handler throw away the old cached shell and adopt the new one. Leaving it unchanged
// means returning visitors keep seeing yesterday's cached version even after a real update.
const CACHE_VERSION = "taktziv-shell-v14";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-16.png",
  "./icons/icon-32.png",
  "./icons/icon-120.png",
  "./icons/icon-152.png",
  "./icons/icon-167.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Cloud-backup SDK, cached best-effort and separately from APP_SHELL — cache.addAll() fails
// entirely if even one URL in it fails, and these are cross-origin, so a single blip fetching
// them must never be able to take down the app's core offline guarantee.
const CLOUD_SDK_URLS = [
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL).then(function () {
        return Promise.all(CLOUD_SDK_URLS.map(function (url) {
          return cache.add(url).catch(function () { /* offline-first guarantee only ever covers the core app shell */ });
        }));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Cache-first: everything the app needs (HTML, CSS, JS, fonts) lives in one self-contained
// index.html, so once it's cached the app is fully usable with zero network. Anything fetched
// successfully gets cached too, so a second visit to any same-origin URL also works offline.
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;

      return fetch(event.request)
        .then(function (response) {
          if (response && response.status === 200 && response.type === "basic") {
            var copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) { cache.put(event.request, copy); });
          }
          return response;
        })
        .catch(function () {
          // Fully offline and this exact URL was never cached — a page navigation should still
          // land on the app shell instead of the browser's own "no internet" error page.
          if (event.request.mode === "navigate") return caches.match("./index.html");
        });
    })
  );
});
