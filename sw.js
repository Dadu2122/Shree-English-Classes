// Shree English Classes / EngTeck — Service Worker (v2)
// FIX: v1 cached index.html itself, so new uploads to GitHub didn't show up until
// the cache expired — that's why updates stopped appearing after this was added.
// v2 strategy:
//   - index.html (the app itself, changes often) -> ALWAYS fetched fresh from network.
//     Falls back to cache only if there's no internet at all.
//   - Big static libraries (Firebase, jsPDF, PDF.js, Razorpay) -> cached for speed,
//     since these almost never change, so repeat opens still feel instant.

const CACHE_NAME = 'engteck-shell-v2';
const LIBRARY_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-database-compat.js',
  'https://checkout.razorpay.com/v1/checkout.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        LIBRARY_FILES.map((url) => cache.add(url).catch(() => {/* ignore individual failures */}))
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never touch Firebase live-data calls or Razorpay payment calls — always live.
  if (url.includes('firebaseio.com') || url.includes('razorpay.com/v1/')) {
    return;
  }

  const isHtmlDocument =
    event.request.mode === 'navigate' ||
    url.endsWith('.html') ||
    url.endsWith('/') ||
    (event.request.destination === 'document');

  if (isHtmlDocument) {
    // NETWORK-FIRST: always try to get the latest index.html; only use the
    // cached copy as a last resort if there's genuinely no internet.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  const isLibraryFile = LIBRARY_FILES.some((f) => url === f);
  if (isLibraryFile) {
    // CACHE-FIRST: these rarely change, so serve instantly and refresh quietly in background.
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cachedResponse) => {
          const networkFetch = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);
          return cachedResponse || networkFetch;
        })
      )
    );
  }
  // Everything else: let the browser handle it normally (no interception).
});
