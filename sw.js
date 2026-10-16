/*
  sw.js: the live scanner's helper on the phone (Phase 9). It sits beside index.html (Scan.html) in the GitHub
  repository. Once an assistant has opened the live scanner with a connection, the phone keeps a copy of the page, its
  icons and its font, so the page opens even with no connection; the scans made then are saved on the phone (by the
  page) and sent to the system when the connection is back.
  - The page itself: always fetched fresh when there is a connection (so an update shows at once), the kept copy only
    when there is none.
  - The icons and the font: the kept copy first; with no connection and no copy, the font is left out quietly.
  - Everything sent to the management system (script.google.com) is never touched or kept here.
*/
var CACHE = 'live-scanner-1';
var FILES = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(FILES.map(function (f) { return cache.add(f).catch(function () { /* a missing file: fine */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return n.indexOf('live-scanner-') === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;   // the management system and anything else: left alone
  if (req.mode === 'navigate') {
    // The page: fresh from the network, kept for later; the kept copy only without a connection.
    event.respondWith(fetch(req).then(function (res) {
      // Only the scanner's own page is kept (another page of the same site never takes its place).
      var home = new URL('./', self.location).pathname;
      var mine = url.pathname === home || url.pathname === home + 'index.html';
      if (mine && res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./', copy); }); }
      return res;
    }, function () {
      return caches.match('./').then(function (hit) { return hit || Response.error(); });
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
