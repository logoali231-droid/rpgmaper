/* App shell service worker for the RPG Map Editor.
   The editor is fully client-side (workspace lives in localStorage), so
   caching the shell is enough to open and draw maps offline. */

const VERSION = "rpgmaper-v2";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

async function precache() {
  const cache = await caches.open(SHELL);
  // Icons and the manifest are fixed names; missing files must not fail the
  // install, so each is added independently.
  await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => null)));

  // The JS/CSS files are content-hashed, so their names are only known from
  // the built index.html. Reading it here is what makes the first offline
  // launch work, not just the second one.
  try {
    const response = await fetch("/index.html", { cache: "reload" });
    if (!response.ok) return;
    const html = await response.text();
    const assets = new Set();
    for (const match of html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)) {
      if (match[1].startsWith("/")) assets.add(match[1]);
    }
    await Promise.all(
      [...assets].map((url) => cache.add(url).catch(() => null))
    );
    await cache.put(
      "/index.html",
      new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
  } catch {
    // Offline install: the shell alone is still better than nothing.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first, so a new build is picked up, with the cached shell
  // as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            (await caches.match("/index.html")) ||
            Response.error()
        )
    );
    return;
  }

  // Build assets are content-hashed, so cache-first is safe and fast.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const cacheable =
          response.ok &&
          (url.pathname.startsWith("/assets/") ||
            /\.(png|svg|webmanifest)$/.test(url.pathname));
        if (cacheable) {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
