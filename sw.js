
const CACHE = "daraku-shell-v2";

const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// インストール時にオフライン用ファイルを保存
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// 古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("daraku-shell-") && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// オンライン時は最新版を取得し、オフライン時はキャッシュを使用
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(self.registration.scope.replace(url.origin, ""))
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();

          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          );
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);

        if (cached) {
          return cached;
        }

        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return Response.error();
      })
  );
});
