/* Bilanz Offline: hält die App auf dem Gerät, damit sie ohne Internet startet. */
const VERSION = '20261008-2dd1b8f5';
const CACHE = 'bilanz-' + VERSION;
const CORE = ["./", "./index.html", "./local.js", "./manifest.webmanifest", "./fonts/fonts.css", "./fonts/archivo-latin-400-normal.woff2", "./fonts/archivo-latin-500-normal.woff2", "./fonts/archivo-latin-600-normal.woff2", "./fonts/archivo-latin-700-normal.woff2", "./fonts/archivo-narrow-latin-500-normal.woff2", "./fonts/archivo-narrow-latin-600-normal.woff2", "./fonts/archivo-narrow-latin-700-normal.woff2", "./vendor/xlsx.full.min.js", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bilanz-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sports.json')) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { ignoreSearch: true }).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
