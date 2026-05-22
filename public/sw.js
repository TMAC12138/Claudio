const CACHE_NAME = 'claudio-v6';
const AUDIO_CACHE = 'claudio-audio-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/player.js',
  '/js/chat.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![CACHE_NAME, AUDIO_CACHE].includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API requests: Network-First
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // TTS audio: Cache-First
  if (url.pathname.startsWith('/tts/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Player audio: Cache-First, keep the latest 10 playable audio requests.
  if (e.request.destination === 'audio') {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const res = await fetch(e.request);
        if (res.ok || res.type === 'opaque') {
          cache.put(e.request, res.clone());
          trimCache(cache, 10);
        }
        return res;
      })
    );
    return;
  }

  // Static assets: Network-First, so UI fixes are not hidden by stale JS/CSS.
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

async function trimCache(cache, maxItems) {
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  await Promise.all(keys.slice(0, keys.length - maxItems).map(key => cache.delete(key)));
}

self.addEventListener('message', (e) => {
  if (e.data?.type !== 'prefetch-audio' || !Array.isArray(e.data.urls)) return;
  e.waitUntil(prefetchAudio(e.data.urls.slice(0, 10)));
});

async function prefetchAudio(urls) {
  const cache = await caches.open(AUDIO_CACHE);
  for (const url of urls) {
    const req = new Request(url, { mode: 'no-cors' });
    const cached = await cache.match(req);
    if (cached) continue;
    try {
      const res = await fetch(req);
      await cache.put(req, res);
    } catch {}
  }
  await trimCache(cache, 10);
}
