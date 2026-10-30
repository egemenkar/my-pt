// Bu dosya scripts/build-sw.py tarafından üretilir. Elle düzenleme, şablonu düzenle.
// Tüm dosyalar ilk açılışta telefona kaydedilir; sonra uygulama internetsiz çalışır.
const CACHE = "my-pt-9a6d9cce01";
const FILES = [
  "./",
  "index.html",
  "body.html",
  "manifest.webmanifest",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "img/ex/Back_Flyes_-_With_Bands-0.jpg",
  "img/ex/Back_Flyes_-_With_Bands-1.jpg",
  "img/ex/Band_Pull_Apart-0.jpg",
  "img/ex/Band_Pull_Apart-1.jpg",
  "img/ex/Band_Skull_Crusher-0.jpg",
  "img/ex/Band_Skull_Crusher-1.jpg",
  "img/ex/Bodyweight_Squat-0.jpg",
  "img/ex/Bodyweight_Squat-1.jpg",
  "img/ex/Bodyweight_Walking_Lunge-0.jpg",
  "img/ex/Bodyweight_Walking_Lunge-1.jpg",
  "img/ex/Butt_Lift_Bridge-0.jpg",
  "img/ex/Butt_Lift_Bridge-1.jpg",
  "img/ex/Dead_Bug-0.jpg",
  "img/ex/Dead_Bug-1.jpg",
  "img/ex/Freehand_Jump_Squat-0.jpg",
  "img/ex/Freehand_Jump_Squat-1.jpg",
  "img/ex/Hip_Extension_with_Bands-0.jpg",
  "img/ex/Hip_Extension_with_Bands-1.jpg",
  "img/ex/Incline_Push-Up-0.jpg",
  "img/ex/Incline_Push-Up-1.jpg",
  "img/ex/Lateral_Raise_-_With_Bands-0.jpg",
  "img/ex/Lateral_Raise_-_With_Bands-1.jpg",
  "img/ex/Mountain_Climbers-0.jpg",
  "img/ex/Mountain_Climbers-1.jpg",
  "img/ex/Plank-0.jpg",
  "img/ex/Plank-1.jpg",
  "img/ex/Push-Ups_-_Close_Triceps_Position-0.jpg",
  "img/ex/Push-Ups_-_Close_Triceps_Position-1.jpg",
  "img/ex/Push-Ups_With_Feet_Elevated-0.jpg",
  "img/ex/Push-Ups_With_Feet_Elevated-1.jpg",
  "img/ex/Pushups-0.jpg",
  "img/ex/Pushups-1.jpg",
  "img/ex/Reverse_Crunch-0.jpg",
  "img/ex/Reverse_Crunch-1.jpg",
  "img/ex/Russian_Twist-0.jpg",
  "img/ex/Russian_Twist-1.jpg",
  "img/ex/Shoulder_Press_-_With_Bands-0.jpg",
  "img/ex/Shoulder_Press_-_With_Bands-1.jpg",
  "img/ex/Side_Bridge-0.jpg",
  "img/ex/Side_Bridge-1.jpg",
  "img/ex/Single_Leg_Glute_Bridge-0.jpg",
  "img/ex/Single_Leg_Glute_Bridge-1.jpg",
  "img/ex/Sit_Squats-0.jpg",
  "img/ex/Sit_Squats-1.jpg",
  "img/ex/Split_Squats-0.jpg",
  "img/ex/Split_Squats-1.jpg",
  "img/ex/Squats_-_With_Bands-0.jpg",
  "img/ex/Squats_-_With_Bands-1.jpg",
  "img/ex/Star_Jump-0.jpg",
  "img/ex/Star_Jump-1.jpg",
  "img/ex/Superman-0.jpg",
  "img/ex/Superman-1.jpg",
  "body/LICENSE-Anny.txt",
  "body/body-model.js",
  "body/body-view.js",
  "body/body.bin",
  "body/body.json",
  "vendor/three/OrbitControls.js",
  "vendor/three/three.module.min.js"
];

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
