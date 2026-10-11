// Bacon service worker (browsers only — the iOS app never registers it; see
// components/PwaRegister.tsx). Deliberately conservative so deploys never
// fight caches:
// - /api/* (data, auth callbacks, webhooks) and /.well-known/*: never touched.
// - Page navigations: network first (with navigation preload); the branded
//   /offline page only when the network is actually unreachable. HTML is never
//   served from cache, so a deploy is live on the next navigation.
// - /_next/static + /icons: cache first (content-hashed / immutable), trimmed
//   so old deploys' chunks don't pile up forever.
// - Everything else (RSC payloads, images, cross-origin): straight to network.
const VERSION = "bacon-sw-v2";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];
const MAX_STATIC_ENTRIES = 300;

// Cache the offline page AND the stylesheets it links, so it renders styled
// when it's needed — by definition, with no network to fetch them.
async function precache() {
  const cache = await caches.open(VERSION);
  await cache.addAll(PRECACHE);
  try {
    const res = await cache.match(OFFLINE_URL);
    const html = res ? await res.text() : "";
    const css = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
    if (css.length) await cache.addAll([...new Set(css)]);
  } catch { /* the page still works unstyled */ }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch { /* optional */ }
    }
    await self.clients.claim();
  })());
});

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_STATIC_ENTRIES;
  // Cache keys come back in insertion order: drop the oldest.
  for (let i = 0; i < extra; i++) {
    const url = new URL(keys[i].url);
    if (!PRECACHE.includes(url.pathname)) await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/")) return;

  // Page navigations: network first; branded offline page when unreachable.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(req);
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }

  // Immutable assets: cache first, fill the cache on a miss.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        event.waitUntil(caches.open(VERSION).then(async (cache) => { await cache.put(req, copy); await trim(cache); }));
      }
      return res;
    })());
  }
});
