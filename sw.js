/*
  app/sw.js: the S.O.J. Academy app's helper on the phone (app18; polish18-B). It sits in the app's folder (app/), so it looks
  after the app's own pages only; the live scanner keeps its own helper (../sw.js) and its own kept copies (live-scanner-*).
  - The app's frame (index.html) opens AT ONCE from the phone's copy (polish18-B; the owner, Sat 24 Oct 2026, 5:10 and
    5:15 AM). With a connection the newest frame is downloaded in the background and kept as "the next one", never over
    the frame in use; the app is told, and switches to it by itself at a safe moment (nothing being saved or scanned in
    the page, 30 seconds with nothing touched): it asks here ("apply"), and the reload takes it from the phone in under a
    second. A fresh opening of the app is a safe moment too. Its manifest and icon: kept, refreshed in the background.
  - Only those few files of this site are ever kept. Nothing from Google (script.google.com, *.googleusercontent.com) or
    any other site goes through here, and nothing with a ? or a # (a personal link) is ever kept.
  - The font (polish18-C, LOOK-42: Roboto Flex from Google Fonts, as every page): its style sheet and font file are kept on
    the phone the first time, then used from there; with no connection and no copy, the font is left out quietly.
*/
var CACHE = 'soj-app-2';   // polish18-B: the frame updates itself at a safe moment (polish18-C: the font is kept in it too)
var NEXT = 'sj-next-page';  // the downloaded update, waiting for its safe moment (a name no real file has)
var FILES = ['./', 'manifest.webmanifest', '../icon-192.png', '../icon-512.png'];

function keepable(url) {
  if (url.origin !== self.location.origin || url.search || url.hash) return '';
  var here = new URL('./', self.location);
  var paths = {};
  FILES.forEach(function (f) { paths[new URL(f, here).pathname] = f; });
  paths[here.pathname + 'index.html'] = './';
  return paths[url.pathname] || '';
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(FILES.map(function (f) { return cache.add(f).catch(function () { /* a missing file: fine */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return n.indexOf('soj-app-') === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

function tellPages(msg) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    list.forEach(function (c) { try { c.postMessage(msg); } catch (e) { /* that window is gone */ } });
  });
}
/** Downloads the newest frame; when it differs from the one in use, keeps it as the next one and tells the app. */
function checkForUpdate(cache) {
  return fetch(new Request('./', { cache: 'no-store' })).then(function (res) {
    if (!res || !res.ok || res.type !== 'basic') return false;
    return res.clone().text().then(function (fresh) {
      return cache.match('./').then(function (cur) {
        if (!cur) return cache.put('./', res).then(function () { return false; });
        return cur.text().then(function (now) {
          if (now === fresh) return cache.delete(NEXT).then(function () { return false; });
          return cache.put(NEXT, res).then(function () { return tellPages({ sj: 'update-ready' }); }).then(function () { return true; });
        });
      });
    });
  }).catch(function () { return false; });
}
/** The next one becomes the frame (a copy inside the phone). */
function applyUpdate(cache) {
  return cache.match(NEXT).then(function (next) {
    if (!next) return false;
    return cache.put('./', next).then(function () { return cache.delete(NEXT); }).then(function () { return true; });
  });
}
self.addEventListener('message', function (event) {
  var d = event.data;
  if (!d || typeof d !== 'object' || typeof d.sj !== 'string') return;
  var reply = function (msg) { try { if (event.source) event.source.postMessage(msg); } catch (e) { /* gone */ } };
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    if (d.sj === 'check') return checkForUpdate(cache);
    if (d.sj === 'status') return cache.match(NEXT).then(function (n) { if (n) reply({ sj: 'update-ready' }); });
    if (d.sj === 'apply') return applyUpdate(cache).then(function (done) { reply({ sj: done ? 'applied' : 'nothing' }); });
    return null;
  }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {   // the font: the kept copy first
    event.respondWith(caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }, function () { return new Response('', { status: 200, headers: { 'Content-Type': url.hostname === 'fonts.googleapis.com' ? 'text/css' : 'font/woff2' } }); });
      });
    }));
    return;
  }
  var key = keepable(url);
  if (!key) return;   // anything else: straight to the network, never kept
  if (key === './') {
    // The frame: the phone's copy at once (an update downloaded earlier becomes it now: a fresh opening is a safe moment);
    // the newest is looked for in the background, for the next safe moment.
    event.respondWith(caches.open(CACHE).then(function (cache) {
      return applyUpdate(cache).then(function () { return cache.match('./'); }).then(function (hit) {
        if (hit) { event.waitUntil(checkForUpdate(cache)); return hit; }
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') cache.put('./', res.clone());
          return res;
        });
      });
    }));
    return;
  }
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(key).then(function (hit) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      });
      if (hit) { event.waitUntil(fresh.catch(function () { /* offline: the kept copy was used */ })); return hit; }
      return fresh;
    });
  }));
});
// End of app/sw.js
