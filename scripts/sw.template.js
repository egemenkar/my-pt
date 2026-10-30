// Bu dosya scripts/build-sw.py tarafından üretilir. Elle düzenleme, şablonu düzenle.
// Tüm dosyalar ilk açılışta telefona kaydedilir; sonra uygulama internetsiz çalışır.
// Yeni sürüm arka planda iner ve bekler; uygulama "Güncelle" deyince devreye girer.
const CACHE = "my-pt-__VERSION__";
const FILES = __FILES__;

self.addEventListener("install", event => {
  // Tarayıcının HTTP önbelleğini atla: yeni sürüm hep sunucudaki taze dosyalarla kurulsun
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
});

// Uygulamadaki "Güncelle" düğmesi
self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("my-pt-") && k !== CACHE).map(k => caches.delete(k))))
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
