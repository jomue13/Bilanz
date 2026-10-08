/* Bilanz Offline: lokaler Speicher (IndexedDB) mit derselben Schnittstelle wie der Claude-Speicher.
   Alle Daten bleiben auf diesem Gerät. */
window.BILANZ_LOCAL = true;
(() => {
  const DBN = 'bilanz', ST = 'docs', UID = 'local', BASE = 'data/users/' + UID + '/';
  const BIG = p => p.indexOf('/vault/full/') >= 0;
  const openDb = () => new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idb = openDb();
  const run = (mode, fn) => idb.then(db => new Promise((res, rej) => {
    const t = db.transaction(ST, mode), s = t.objectStore(ST); let out;
    const req = fn(s); if (req && 'onsuccess' in req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
  }));
  const mem = new Map(), vers = new Map(), snaps = new Map();
  const ready = idb.then(db => new Promise((res, rej) => {
    const t = db.transaction(ST, 'readonly'), r = t.objectStore(ST).openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return; if (!BIG(c.key)) mem.set(c.key, c.value); c.continue(); };
    t.oncomplete = res; t.onerror = () => rej(t.error);
  })).then(() => { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { } });
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const meta = Object.freeze({ fromCache: false, hasPendingWrites: false });
  function snapOf(path, val) {
    const v = val !== undefined ? val : mem.get(path), k = vers.get(path) || 0, c = snaps.get(path);
    if (val === undefined && c && c.k === k) return c.s;
    const s = Object.freeze({ id: path.split('/').pop(), exists: v !== undefined, data: () => clone(v), metadata: meta });
    if (val === undefined) snaps.set(path, { k, s });
    return s;
  }
  const parentOf = p => p.split('/').slice(0, -1).join('/');
  /* Beobachter */
  const docL = new Map(), colL = new Set(); let pending = new Set(), flushT = null;
  function notify(path) { pending.add(path); if (!flushT) flushT = setTimeout(flushNotify, 0); }
  function flushNotify() {
    const ps = pending; pending = new Set(); flushT = null;
    for (const p of ps) { const ls = docL.get(p); if (ls) for (const fn of ls) try { fn(snapOf(p)); } catch (e) { console.error(e); } }
    const cols = new Set([...ps].map(parentOf));
    for (const L of colL) if (cols.has(L.path)) try { L.fn(querySnap(L)); } catch (e) { console.error(e); }
  }
  function children(col) {
    const pre = col + '/', n = col.split('/').length + 1, out = [];
    for (const k of mem.keys()) if (k.startsWith(pre) && k.split('/').length === n) out.push(k);
    return out;
  }
  function querySnap(Q) {
    let docs = children(Q.path).map(k => snapOf(k));
    if (Q.where.length) docs = docs.filter(d => Q.where.every(([f, op, v]) => { const x = (d.data() || {})[f]; return op === '==' ? x === v : op === '!=' ? x !== v : op === '<' ? x < v : op === '<=' ? x <= v : op === '>' ? x > v : op === '>=' ? x >= v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : true; }));
    if (Q.ord) { const [f, dir] = Q.ord, m = dir === 'desc' ? -1 : 1; docs.sort((a, b) => { const x = (mem.get(Q.path + '/' + a.id) || {})[f], y = (mem.get(Q.path + '/' + b.id) || {})[f]; return (x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1) * m; }); }
    else docs.sort((a, b) => a.id < b.id ? -1 : 1);
    docs = docs.slice(0, Q.lim);
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta };
  }
  /* Schreiben */
  async function put(path, data) {
    await ready; const v = clone(data);
    await run('readwrite', s => s.put(v, path));
    if (!BIG(path)) mem.set(path, v); vers.set(path, (vers.get(path) || 0) + 1); notify(path);
  }
  async function del(path) {
    await ready; await run('readwrite', s => s.delete(path));
    mem.delete(path); vers.set(path, (vers.get(path) || 0) + 1); notify(path);
  }
  const merge = (a, b) => { const o = Object.assign({}, a); for (const k of Object.keys(b)) { const v = b[k]; if (v && typeof v === 'object' && v.__delete__ === true) delete o[k]; else if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = merge(o[k], v); else o[k] = v; } return o; };
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      get: async () => { await ready; if (BIG(path)) { const v = await run('readonly', s => s.get(path)); return Object.freeze({ id: path.split('/').pop(), exists: v !== undefined, data: () => clone(v), metadata: meta }); } return snapOf(path); },
      set: d => put(path, d),
      update: async d => { await ready; const cur = BIG(path) ? await run('readonly', s => s.get(path)) : mem.get(path); if (cur === undefined) throw { code: 'invalid_argument', message: 'Dokument fehlt' }; return put(path, merge(cur, d)); },
      delete: () => del(path),
      acquire: async () => ({ acquired: true }),
      onSnapshot: (next, err) => { let on = true; const fn = s => on && next(s); const ls = docL.get(path) || new Set(); ls.add(fn); docL.set(path, ls); ready.then(() => fn(snapOf(path))); return () => { on = false; ls.delete(fn); }; },
      collection: sub => colRef(path + '/' + sub)
    };
  }
  function colRef(path, Q) {
    Q = Q || { path, where: [], ord: null, lim: 100000 };
    const q = {
      path,
      doc: id => docRef(path + '/' + (id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8))),
      add: async d => { const r = q.doc(); await r.set(d); return r; },
      where: (f, op, v) => colRef(path, Object.assign({}, Q, { where: Q.where.concat([[f, op, v]]) })),
      orderBy: (f, dir) => colRef(path, Object.assign({}, Q, { ord: [f, dir || 'asc'] })),
      limit: n => colRef(path, Object.assign({}, Q, { lim: n })),
      get: async () => { await ready; return querySnap(Q); },
      onSnapshot: (next, err) => { const L = { path, where: Q.where, ord: Q.ord, lim: Q.lim, fn: s => L.on && next(s), on: true }; colL.add(L); ready.then(() => L.fn(querySnap(L))); return () => { L.on = false; colL.delete(L); }; }
    };
    return q;
  }
  const db = Object.freeze({ doc: docRef, collection: p => colRef(p) });
  const user = Object.freeze({ id: async () => UID, me: async () => ({ id: UID, name: '' }), isOwner: async () => true, canEdit: async () => true, can: async () => true, profiles: async () => ({}), search: async () => [] });
  const TYPES = { json: 'application/json', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain' };
  const downloads = Object.freeze({
    save: async ({ filename, data }) => {
      const ext = String(filename).split('.').pop().toLowerCase(), type = TYPES[ext] || 'application/octet-stream';
      const blob = data instanceof Blob ? data : new Blob([data], { type });
      let file = null; try { file = new File([blob], filename, { type }); } catch (e) { }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: filename }); return {}; }
        catch (e) { if (e && e.name === 'AbortError') throw { code: 'cancelled', message: 'abgebrochen' }; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000); return {};
    }
  });
  window.claude = Object.freeze({ use: async name => { await ready; return name === 'db' ? db : name === 'user' ? user : name === 'downloads' ? downloads : null; } });

  /* Wetter direkt von Open-Meteo, Spielplan von der eigenen Seite */
  const WX = 'https://api.open-meteo.com/v1/forecast?timezone=Europe%2FBerlin&forecast_days=10'
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day'
    + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunshine_duration';
  let wxBusy = false, spBusy = false;
  async function refreshWeather(force) {
    if (wxBusy || navigator.onLine === false) return; wxBusy = true;
    try {
      await ready;
      const prof = mem.get(BASE + 'profile') || {}, st = prof.settings || {}, lat = +st.lat, lon = +st.lon;
      if (!isFinite(lat) || !isFinite(lon) || (!lat && !lon)) return;
      const cur = mem.get(BASE + 'weather');
      if (!force && cur && cur.fetched_at && Date.now() - Date.parse(cur.fetched_at) < 40 * 60000 && cur.lat === lat && cur.lon === lon) return;
      const r = await fetch(WX + '&latitude=' + lat + '&longitude=' + lon, { cache: 'no-store' }); if (!r.ok) return;
      const d = await r.json(); if (!d.current || !d.hourly || !d.daily) return;
      await put(BASE + 'weather', { fetched_at: new Date().toISOString(), source: 'Open-Meteo', lat, lon, current: d.current, hourly: d.hourly, daily: d.daily });
    } catch (e) { } finally { wxBusy = false; }
  }
  async function refreshSports() {
    if (spBusy || navigator.onLine === false) return; spBusy = true;
    try {
      await ready;
      const cur = mem.get(BASE + 'sports'), last = +localStorage.getItem('bilanz.sportsCheck') || 0;
      if (cur && Date.now() - last < 3 * 3600e3) return;
      const r = await fetch('sports.json', { cache: 'no-cache' }); if (!r.ok) return;
      const d = await r.json(); localStorage.setItem('bilanz.sportsCheck', String(Date.now()));
      if (!d || !Array.isArray(d.games)) return;
      if (!cur || cur.updated_at !== d.updated_at) await put(BASE + 'sports', d);
    } catch (e) { } finally { spBusy = false; }
  }
  const refresh = () => { refreshWeather(); refreshSports(); };
  ready.then(() => setTimeout(refresh, 400));
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  setInterval(refresh, 15 * 60000);
  window.BILANZ_REFRESH_WEATHER = () => refreshWeather(true);
})();
