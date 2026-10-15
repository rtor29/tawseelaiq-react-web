// عامل الخدمة لتطبيق توصيله (PWA)
// - التنقل: شبكة أولاً مع سقوط على cache/index.html (يعمل دون اتصال)
// - الأصول الثابتة (نفس الأصل): cache أولاً
// - Mapbox والـ API: شبكة دائماً (بيانات حية لا تُخزَّن)

const CACHE_NAME = 'tawseela-v1';
const PRECACHE_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // نداءات الخادم وخرائط Mapbox: شبكة فقط
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/hubs/') || url.hostname.endsWith('mapbox.com')) {
    return;
  }

  // التنقل (صفحات SPA): شبكة أولاً ثم cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // الأصول الثابتة بنفس الأصل: cache أولاً
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
