// عامل الخدمة لتطبيق توصيله (PWA Service Worker)
// - التخزين المؤقت للأصول الثابتة (Static Assets: الخطوط، الأيقونات، CSS، JS، الصور)
// - استراتيجية Cache-First للأصول الثابتة والخطوط لتسريع الفتح الفوري
// - استراتيجية Network-First مع السقوط على الكاش للتنقل عند انقطاع أو ضعف الاتصال
// - استثناء استعلامات الـ API و Mapbox الحية من الكاش للحفاظ على دقة التتبع اللحظي

const CACHE_NAME = 'tawseela-static-v46';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/fonts/arial-unicode-ms.woff2',
  '/manifest.webmanifest',
  '/manifest.json',
  '/app-icon.png',
  '/apple-touch-icon.png',
  '/logo.png',
  '/logo-v2.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
];

// استقبال أوامر التحديث الفوري
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// تثبيت عامل الخدمة وتحميل الأصول الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// تفعيل عامل الخدمة ومسح النسخ القديمة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// اعتراض الطلبات وتطبيق استراتيجيات الكاش
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. استعلامات الخادم المباشرة والتتبع الحي وماب بوكس: شبكة فقط دائماً دون كاش
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/hubs/') ||
    url.hostname.includes('mapbox.com')
  ) {
    return;
  }

  // 2. طلبات صفحات التطبيق (Navigation / SPA routing): شبكة أولاً مع fallback إلى index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((res) => res || fetch(request))),
    );
    return;
  }

  // 3. الخطوط الخارجية (Google Fonts): Cache-First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkRes;
        });
      }),
    );
    return;
  }

  // 4. الأصول الثابتة للتطبيق (JS, CSS, الصور, الأيقونات): Cache-First
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.webmanifest'));

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const copy = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return networkRes;
          })
          .catch(() => caches.match(request));
      }),
    );
  }
});
