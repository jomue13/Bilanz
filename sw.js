/* Bilanz Offline: hält die App auf dem Gerät, damit sie ohne Internet startet. */
const VERSION = '20261021-69c0a175';
const CACHE = 'bilanz-' + VERSION;
/* Große Datendateien (Produkte, Filme) liegen in eigenen Speichern und werden nur neu geladen, wenn sie sich ändern. */
const FOODS_VER = 'feecaef5';
const MEDIA_VER = '3f4ba28c';
const IMG = 'bilanz-img';
const IMG_HOSTS = /(^|\.)(wikimedia\.org|imgur\.com|dfb\.de|espncdn\.com|uefa\.com|tmdb\.org|openfoodfacts\.org|google\.com|gstatic\.com)$/;
const DATA = [['./foods-de.txt', 'bilanz-foods-' + FOODS_VER], ['./media-de.txt', 'bilanz-media-' + MEDIA_VER]];
const CORE = ["./", "./index.html", "./local.js", "./manifest.webmanifest", "./fonts/fonts.css", "./fonts/nunito-latin-600-normal.woff2", "./fonts/nunito-latin-700-normal.woff2", "./fonts/nunito-latin-800-normal.woff2", "./vendor/xlsx.full.min.js", "./vendor/zxing.min.js", "./vendor/idiomorph.min.js", "./app-icon-180.png", "./app-icon-192.png", "./app-icon-512.png", "./icons3d/abzeichen.webp", "./icons3d/abos.webp", "./icons3d/backup.webp", "./icons3d/steuer.webp", "./icons3d/alkohol.webp", "./icons3d/arbeit.webp", "./icons3d/basketball.webp", "./icons3d/einkauf.webp", "./icons3d/essen.webp", "./icons3d/feuer.webp", "./icons3d/film.webp", "./icons3d/finanzen.webp", "./icons3d/fotos.webp", "./icons3d/geburtstage.webp", "./icons3d/geschenk.webp", "./icons3d/heute.webp", "./icons3d/ideen.webp", "./icons3d/kalender.webp", "./icons3d/koerper.webp", "./icons3d/labor.webp", "./icons3d/mahlzeiten.webp", "./icons3d/medien.webp", "./icons3d/merk.webp", "./icons3d/pack.webp", "./icons3d/plan.webp", "./icons3d/rekord.webp", "./icons3d/rezepte.webp", "./icons3d/routinen.webp", "./icons3d/rueckblick.webp", "./icons3d/schloss.webp", "./icons3d/schritte.webp", "./icons3d/settings.webp", "./icons3d/sonne.webp", "./icons3d/sport.webp", "./icons3d/stadion.webp", "./icons3d/statistik.webp", "./icons3d/termin.webp", "./icons3d/training.webp", "./icons3d/uni.webp", "./icons3d/verlauf.webp", "./icons3d/wasser.webp", "./icons3d/wetter.webp", "./icons3d/wrap.webp", "./icons3d/zaehler.webp", "./icons3d/ziel.webp", "./fonts/barlow-condensed-latin-700-normal.woff2", "./fonts/barlow-condensed-latin-700-italic.woff2", "./fonts/barlow-condensed-latin-800-italic.woff2", "./fonts/bricolage-grotesque-latin-600-normal.woff2", "./fonts/bricolage-grotesque-latin-800-normal.woff2"];
function dataGet(d) {
  return caches.open(d[1]).then(c => c.match(d[0]).then(r => r || fetch(new Request(d[0], { cache: 'reload' })).then(res => { if (res.ok) c.put(d[0], res.clone()); return res; })));
}
self.addEventListener('install', e => {
  e.waitUntil(Promise.all([caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))), ...DATA.map(d => dataGet(d).catch(() => { }))]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bilanz-') && k !== CACHE && k !== IMG && !DATA.some(d => d[1] === k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) {
    /* Wappen, Poster, Produktfotos: einmal laden, danach auch offline */
    if (req.destination === 'image' && IMG_HOSTS.test(url.hostname)) e.respondWith(caches.open(IMG).then(c => c.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); c.keys().then(ks => { if (ks.length > 700) ks.slice(0, ks.length - 600).forEach(k => c.delete(k)); }); }
      return res;
    }))));
    return;
  }
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
