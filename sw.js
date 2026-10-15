/* Bilanz Offline: hält die App auf dem Gerät, damit sie ohne Internet startet. */
const VERSION = '20261015-36c66ed9';
const CACHE = 'bilanz-' + VERSION;
/* Die große Produktdatenbank liegt in einem eigenen Speicher und wird nur neu geladen, wenn sie sich ändert. */
const FOODS = './foods-de.txt';
const FOODS_VER = 'feecaef5';
const FOODS_CACHE = 'bilanz-foods-' + FOODS_VER;
const CORE = ["./", "./index.html", "./local.js", "./manifest.webmanifest", "./fonts/fonts.css", "./fonts/nunito-latin-600-normal.woff2", "./fonts/nunito-latin-700-normal.woff2", "./fonts/nunito-latin-800-normal.woff2", "./vendor/xlsx.full.min.js", "./vendor/zxing.min.js", "./vendor/idiomorph.min.js", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
function foodsGet() {
  return caches.open(FOODS_CACHE).then(c => c.match(FOODS).then(r => r || fetch(new Request(FOODS, { cache: 'reload' })).then(res => { if (res.ok) c.put(FOODS, res.clone()); return res; })));
}
self.addEventListener('install', e => {
  e.waitUntil(Promise.all([caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))), foodsGet().catch(() => { })]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bilanz-') && k !== CACHE && k !== FOODS_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sports.json')) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
    return;
  }
  if (url.pathname.endsWith('/foods-de.txt')) { e.respondWith(foodsGet()); return; }
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { ignoreSearch: true }).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
