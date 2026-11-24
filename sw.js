const CACHE_PREFIX = 'retro-idle-';
const CACHE_NAME = 'retro-idle-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './autofight.js',
  './manifest.webmanifest',
  './vendor/binjgb/binjgb.js',
  './vendor/binjgb/binjgb.wasm',
  './vendor/mgba/mgba.js',
  './vendor/mgba/mgba.wasm',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

function getScopeHref() {
  return self.registration?.scope || new URL('./', self.location.href).href;
}

function isCacheableResponse(res) {
  return Boolean(res && res.status === 200 && res.type === 'basic');
}

async function matchShellCache(cache, request, scopeHref) {
  return (
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true })) ||
    (request.mode === 'navigate'
      ? (await cache.match(new URL('./', scopeHref).href)) ||
        (await cache.match(new URL('./index.html', scopeHref).href))
      : undefined)
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const scopeHref = getScopeHref();
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE_ASSETS.map(async (asset) => {
          const url = new URL(asset, scopeHref).href;
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (!isCacheableResponse(res)) {
            throw new Error(`Failed to precache ${asset}: HTTP ${res.status}`);
          }
          await cache.put(url, res);
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const scopeHref = getScopeHref();
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scopeHref)) {
    return;
  }

  const relPath = url.href.slice(scopeHref.length).split(/[?#]/)[0];

  if (relPath.startsWith('vendor/') || relPath.startsWith('icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached =
          (await cache.match(request)) ||
          (await cache.match(`${url.origin}${url.pathname}`));
        if (cached) return cached;

        const res = await fetch(request);
        if (isCacheableResponse(res)) {
          await cache.put(request, res.clone());
        }
        return res;
      })()
    );
    return;
  }

  if (
    request.mode === 'navigate' ||
    relPath === '' ||
    relPath === 'index.html' ||
    relPath === 'autofight.js' ||
    relPath === 'manifest.webmanifest'
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        if (self.navigator.onLine === false) {
          const offlineCached = await matchShellCache(cache, request, scopeHref);
          if (offlineCached) return offlineCached;
        }
        try {
          const res = await fetch(request);
          if (isCacheableResponse(res)) {
            await cache.put(request, res.clone());
          }
          return res;
        } catch (err) {
          const cached = await matchShellCache(cache, request, scopeHref);
          if (cached) return cached;
          throw err;
        }
      })()
    );
  }
});
