/*
  sw.js: the live scanner's helper on the phone (Phase 9; polish18-B). It sits beside index.html (Scan.html) in the GitHub
  repository. Once an assistant has opened the live scanner with a connection, the phone keeps a copy of the page, its
  icons and its font, so the page opens even with no connection; the scans made then are saved on the phone (by the
  page) and sent to the system when the connection is back.
  - The page itself (polish18-B; the owner, Sat 24 Oct 2026, 5:10 and 5:15 AM): the phone's copy opens AT ONCE. With a
    connection, the newest page is downloaded in the background and kept beside it as "the next one" (never over the
    page in use). The page is told an update is ready and switches to it by itself at a safe moment (no scan in progress,
    every saved scan sent, 30 seconds with nothing happening): it asks here ("apply"), the next one becomes the page, and
    the reload takes it from the phone in under a second. Opening the scanner again is a safe moment too.
  - The icons and the font: the kept copy first; with no connection and no copy, the font is left out quietly.
  - Everything sent to the management system (script.google.com) is never touched or kept here.
*/
var CACHE = 'live-scanner-3';   // polish18-B: the page opens from the phone and updates itself at a safe moment
var FILES = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
var NEXT = 'sj-next-page';      // the downloaded update, waiting for its safe moment (a name no real file has)

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    // The page kept by the older helper (live-scanner-2) comes along, so the phone keeps opening offline after this update.
    return caches.open('live-scanner-2').then(function (old) { return old.match('./'); }).then(function (hit) {
      return hit ? cache.put('./', hit) : null;
    }).catch(function () { return null; }).then(function () {
      return Promise.all(FILES.map(function (f) { return f === './' ? cache.match('./').then(function (h) { return h || cache.add(f); }).catch(function () { /* fine */ }) : cache.add(f).catch(function () { /* a missing file: fine */ }); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return n.indexOf('live-scanner-') === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

function tellPages(msg) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    list.forEach(function (c) { try { c.postMessage(msg); } catch (e) { /* that page is gone */ } });
  });
}

/** Downloads the newest page; when it differs from the page in use, keeps it as the next one and tells the pages. */
function checkForUpdate(cache) {
  return fetch(new Request('./', { cache: 'no-store' })).then(function (res) {
    if (!res || !res.ok || res.type !== 'basic') return false;
    return res.clone().text().then(function (fresh) {
      return cache.match('./').then(function (cur) {
        if (!cur) { return cache.put('./', res).then(function () { return false; }); }   // the first copy: it simply becomes the page
        return cur.text().then(function (now) {
          if (now === fresh) return cache.delete(NEXT).then(function () { return false; });   // up to date: nothing waits
          return cache.put(NEXT, res).then(function () { return tellPages({ sj: 'update-ready' }); }).then(function () { return true; });
        });
      });
    });
  }).catch(function () { return false; });   // no connection: the next check
}

/** The next one becomes the page (the switch itself: a copy inside the phone, well under a second). */
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
  var fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;   // the management system and anything else: left alone
  if (req.mode === 'navigate') {
    // Only the scanner's own page is kept (another page of the same site never takes its place).
    var home = new URL('./', self.location).pathname;
    var mine = url.pathname === home || url.pathname === home + 'index.html';
    if (!mine) return;
    event.respondWith(caches.open(CACHE).then(function (cache) {
      // A fresh opening is a safe moment: an update downloaded earlier becomes the page now.
      return applyUpdate(cache).then(function () { return cache.match('./'); }).then(function (kept) {
        if (kept) {
          event.waitUntil(checkForUpdate(cache));   // in the background, for the next safe moment
          return kept;
        }
        return fetch(req).then(function (res) {   // never opened here before: from the network, and kept
          if (res && res.ok && res.type === 'basic') cache.put('./', res.clone());
          return res;
        });
      });
    }));
    return;
  }
  event.respondWith(caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }, function () {
      // No connection and no kept copy: the font is left out quietly (the page uses the phone's own font); an icon is
      // simply missing. Never an error on the page.
      if (fonts) return new Response('', { status: 200, headers: { 'Content-Type': url.hostname === 'fonts.googleapis.com' ? 'text/css' : 'font/woff2' } });
      return Response.error();
    });
  }));
});
// End of sw.js
