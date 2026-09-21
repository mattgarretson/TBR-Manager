import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const SERVICE_WORKER_FILE = "sw.js";
const BUILD_ID_LINE = 'const BUILD_ID = "development";';
const BUILD_FILES_LINE = "const BUILD_FILES = [];";
// Only ?demo=1 ever fetches these, and they are far too big to push at every install. The
// worker still caches them at runtime, so a demo stays offline-capable once it has loaded.
const PRECACHE_EXCLUDED = ["index.html", "demo-library.json"];

// Stamps the built sw.js with a hash of the build and every emitted file, so each deploy
// precaches the whole app for offline use and the worker deletes the previous build's cache.
function serviceWorkerPrecache(): Plugin {
  let outDir = "";
  return {
    name: "plot-pile-service-worker-precache",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const entries = await readdir(outDir, { recursive: true, withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(outDir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
        .filter((file) => file !== SERVICE_WORKER_FILE)
        .sort();
      const hash = createHash("sha256");
      for (const file of files) {
        hash.update(file);
        hash.update(await readFile(path.join(outDir, file)));
      }

      const workerPath = path.join(outDir, SERVICE_WORKER_FILE);
      const source = await readFile(workerPath, "utf8");
      if (!source.includes(BUILD_ID_LINE) || !source.includes(BUILD_FILES_LINE)) {
        throw new Error(`${SERVICE_WORKER_FILE} no longer contains the placeholder lines the precache plugin rewrites.`);
      }
      // index.html is precached as "./", which is the URL navigations actually request.
      const buildFiles = files.filter((file) => !PRECACHE_EXCLUDED.includes(file)).map((file) => `./${file}`);
      const buildId = hash.digest("hex").slice(0, 16);
      await writeFile(workerPath, source
        .replace(BUILD_ID_LINE, () => `const BUILD_ID = ${JSON.stringify(buildId)};`)
        .replace(BUILD_FILES_LINE, () => `const BUILD_FILES = ${JSON.stringify(buildFiles)};`));
    },
  };
}

export default defineConfig({
  // Relative asset URLs let one build run at a domain root or under a
  // GitHub Pages project path such as /TBR-Manager/.
  base: "./",
  plugins: [react(), serviceWorkerPrecache()],
  server: { port: 3000, strictPort: true },
});
