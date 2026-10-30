// Bu dosya scripts/build-sw.py tarafından üretilir. Elle düzenleme, şablonu düzenle.
// Tüm dosyalar ilk açılışta telefona kaydedilir; sonra uygulama internetsiz çalışır.
const CACHE = "my-pt-__VERSION__";
const FILES = __FILES__;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Önce önbellek: internet olsa da olmasa da dosyalar telefondan gelir
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(event.request).catch(() =>
        event.request.mode === "navigate" ? caches.match("index.html") : Response.error()
      );
    })
  );
});
