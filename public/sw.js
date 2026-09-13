// The production build rewrites the next two lines (see serviceWorkerPrecache in vite.config.ts)
// with a hash of the build and the files it emitted. These placeholder values only run in tests.
const BUILD_ID = "development";
const BUILD_FILES = [];

const CACHE_PREFIX = "plot-pile-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
// Resolve against the worker's own URL so the app works at a domain root or
// under a project path such as /TBR-Manager/.
const scoped = (path) => new URL(path, self.location.href).href;
const SHELL_URL = scoped("./");
const PRECACHE_URLS = [...new Set(["./", ...BUILD_FILES].map(scoped))];

self.addEventListener("install", (event) => {
  // Precache the whole build so the app opens offline right after installing or updating.
  // "reload" bypasses the HTTP cache so a stale index.html can't point at the previous build's files.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Every deploy gets its own cache, so deleting the other Plot Pile caches drops old builds' files.
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(SHELL_URL)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
