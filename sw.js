const CACHE = 'op-central-v1';
const ASSETS = ['./chase-tracker%20(2).html', './catalog.js', './opc-config.js', './logo.png', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      if (e.request.url.includes('catalog.js') || e.request.url.includes('chase-tracker'))
        caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => cached))
  );
});
