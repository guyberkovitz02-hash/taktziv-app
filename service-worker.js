// Bump this on every deploy that changes index.html/manifest/icons — it's what makes the
// activate handler throw away the old cached shell and adopt the new one. Leaving it unchanged
// means returning visitors keep seeing yesterday's cached version even after a real update.
const CACHE_VERSION = "taktziv-shell-v39";

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

// Cloud-backup SDK, cached best-effort and separately from APP_SHELL — a single failed URL here
// must never be able to fail the whole install and take down the app's core offline guarantee
// (unlike APP_SHELL below, where every URL failing to cache correctly fails the install).
const CLOUD_SDK_URLS = [
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"
];

// cache.addAll()/cache.add() fetch through the browser's ORDINARY HTTP cache by default — which
// respects the Cache-Control header GitHub Pages serves (max-age=600). That means the very
// moment this install handler matters most — right after a fresh deploy, when a visitor's
// browser may well have fetched index.html itself within the last 10 minutes — cache.addAll()
// could silently pull that STALE, browser-HTTP-cached copy into this brand-new, correctly-
// versioned cache, even though CACHE_VERSION itself (this file) is always fetched cache-bypassed
// by spec. The app would then look like it "updated" (new SW, new version string, new build-
// version display) while actually still serving old markup/CSS/JS underneath. Fetching every
// APP_SHELL URL manually with {cache:"reload"} forces a real network round-trip that ignores
// any HTTP cache entirely, so what lands in this cache is always genuinely what's on the server
// right now.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return Promise.all(APP_SHELL.map(function (url) {
        return fetch(url, { cache: "reload" }).then(function (response) { return cache.put(url, response); });
      })).then(function () {
        return Promise.all(CLOUD_SDK_URLS.map(function (url) {
          return fetch(url, { cache: "reload" }).then(function (response) { return cache.put(url, response); })
            .catch(function () { /* offline-first guarantee only ever covers the core app shell */ });
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

// Lets the page ask the service worker THAT'S ACTUALLY CONTROLLING IT right now which build it
// is — shown in Settings › אודות. Answers "is this device really running what was just
// deployed" directly instead of everyone (developer included) having to guess from symptoms.
self.addEventListener("message", function (event) {
  if (event.data === "getVersion") event.source.postMessage({ type: "version", version: CACHE_VERSION });
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
