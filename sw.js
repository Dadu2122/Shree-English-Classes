// Shree English Classes / EngTeck — Service Worker
// Purpose: cache the app shell (index.html + CDN libraries) so that after the
// FIRST open, every later open is instant — loaded straight from the phone's
// cache instead of downloading ~900KB over the network again. This is the
// same trick apps like Teachmint use to feel instant even on weak signal.
// Firebase data (live student/content data) is NOT cached here — only the
// app shell — so registrations, payments, and content always stay live.

const CACHE_NAME = 'engteck-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-database-compat.js',
  'https://checkout.razorpay.com/v1/checkout.js'
];

// On install: download and cache the app shell once.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll can fail if even one URL 404s — cache what we can individually
      // instead, so one bad/blocked CDN request doesn't stop caching the rest.
      return Promise.all(
        SHELL_FILES.map((url) =>
          cache.add(url).catch(() => {/* ignore individual failures */})
        )
      );
    })
  );
});

// On activate: remove any old versions of the cache.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy: "stale-while-revalidate" for the app shell files —
// serve instantly from cache, and quietly re-download a fresh copy in the
// background so the NEXT open has any updates you've pushed to GitHub.
// Firebase database calls (realtime data) always go straight to network,
// never cached, so live content/payments are never stale.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never cache Firebase realtime database calls or Razorpay payment calls —
  // these must always be live.
  if (url.includes('firebaseio.com') || url.includes('razorpay.com/v1/')) {
    return; // let the browser handle it normally (network only)
  }

  const isShellFile = SHELL_FILES.some((f) => url.endsWith(f) || url === f);
  if (!isShellFile && event.request.method !== 'GET') return;

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
          .catch(() => cachedResponse); // offline fallback to cache

        // Instant if cached, otherwise wait for network once.
        return cachedResponse || networkFetch;
      })
    )
  );
});
