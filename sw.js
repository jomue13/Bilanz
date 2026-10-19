/* Bilanz Offline: hält die App auf dem Gerät, damit sie ohne Internet startet. */
const VERSION = '20261019-965c3eba';
const CACHE = 'bilanz-' + VERSION;
/* Große Datendateien (Produkte, Filme) liegen in eigenen Speichern und werden nur neu geladen, wenn sie sich ändern. */
const FOODS_VER = 'feecaef5';
const MEDIA_VER = '3f4ba28c';
const DATA = [['./foods-de.txt', 'bilanz-foods-' + FOODS_VER], ['./media-de.txt', 'bilanz-media-' + MEDIA_VER]];
const CORE = ["./", "./index.html", "./local.js", "./manifest.webmanifest", "./fonts/fonts.css", "./fonts/nunito-latin-600-normal.woff2", "./fonts/nunito-latin-700-normal.woff2", "./fonts/nunito-latin-800-normal.woff2", "./vendor/xlsx.full.min.js", "./vendor/zxing.min.js", "./vendor/idiomorph.min.js", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
function dataGet(d) {
  return caches.open(d[1]).then(c => c.match(d[0]).then(r => r || fetch(new Request(d[0], { cache: 'reload' })).then(res => { if (res.ok) c.put(d[0], res.clone()); return res; })));
}
self.addEventListener('install', e => {
  e.waitUntil(Promise.all([caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))), ...DATA.map(d => dataGet(d).catch(() => { }))]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bilanz-') && k !== CACHE && !DATA.some(d => d[1] === k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sports.json')) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
    return;
  }
  const dd = DATA.find(d => url.pathname.endsWith(d[0].slice(1)));
  if (dd) { e.respondWith(dataGet(dd)); return; }
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { ignoreSearch: true }).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
