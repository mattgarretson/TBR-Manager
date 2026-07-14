import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

test("the app exposes the complete mobile information architecture", () => {
  assert.match(page, /My TBR/);
  assert.match(page, /Series/);
  assert.match(page, /Install Plot Pile/);
  assert.match(page, /Download backup/);
  assert.match(page, /Import a backup/);
  assert.match(page, /Position in series/);
  assert.match(page, /Next release date/);
  assert.match(page, /Bookshop/);
  assert.match(page, /Forest/);
  assert.match(page, /Ocean/);
  assert.match(page, /Lavender/);
  assert.match(page, /plot-pile-theme/);
  assert.doesNotMatch(page, /Remember why you wanted to read it/);
});

test("the PWA manifest is installable and the app registers offline support", () => {
  assert.equal(manifest.name, "Plot Pile");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  assert.match(page, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /caches\.match/);
});
