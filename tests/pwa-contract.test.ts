import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerHandler = (event: unknown) => void;

async function loadWorker(cacheStorage: Record<string, unknown>, fetcher = vi.fn()) {
  const source = await readFile(path.resolve(process.cwd(), "public/sw.js"), "utf8");
  const handlers = new Map<string, WorkerHandler>();
  const workerScope = {
    addEventListener: vi.fn((name: string, handler: WorkerHandler) => handlers.set(name, handler)),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: "https://plot-pile.test", href: "https://plot-pile.test/TBR-Manager/sw.js" },
  };
  vm.runInNewContext(source, {
    self: workerScope,
    caches: cacheStorage,
    fetch: fetcher,
    URL,
    Request,
    Response,
    Promise,
  });
  return { handlers, workerScope };
}

function extendableEvent() {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    event: { waitUntil: (promise: Promise<unknown>) => { pending = promise; } },
    settled: () => pending,
  };
}

describe("PWA contract", () => {
  it("publishes an installable manifest with path-relative URLs", async () => {
    const manifest = JSON.parse(await readFile(path.resolve(process.cwd(), "public/manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({ name: "Plot Pile", display: "standalone", id: "./", start_url: "./", scope: "./" });
    expect(manifest.share_target).toEqual({
      action: "./",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]));
    expect(manifest.icons.every((icon: { src: string }) => !icon.src.startsWith("/"))).toBe(true);
  });

  it("registers install, activate, and fetch handlers scoped to its own path", async () => {
    const cachedShell = new Response("offline shell");
    const cacheMatch = vi.fn().mockResolvedValue(cachedShell);
    const { handlers } = await loadWorker(
      { open: vi.fn(), keys: vi.fn(), delete: vi.fn(), match: cacheMatch },
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    expect([...handlers.keys()]).toEqual(["install", "activate", "fetch"]);

    const respondWith = vi.fn();
    handlers.get("fetch")!({
      request: { method: "GET", url: "https://plot-pile.test/TBR-Manager/?title=Shared", mode: "navigate" },
      respondWith,
    });
    expect(respondWith).toHaveBeenCalledOnce();
    expect(await respondWith.mock.calls[0][0]).toBe(cachedShell);
    expect(cacheMatch).toHaveBeenCalledWith("https://plot-pile.test/TBR-Manager/");

    for (const url of [
      "https://covers.openlibrary.org/b/id/1-M.jpg",
      "https://plot-pile.test/another-project/app.js",
    ]) {
      const bypassRespondWith = vi.fn();
      handlers.get("fetch")!({ request: { method: "GET", url, mode: "cors" }, respondWith: bypassRespondWith });
      expect(bypassRespondWith).not.toHaveBeenCalled();
    }
  });

  it("precaches past the HTTP cache and deletes only older Plot Pile caches", async () => {
    const cache = { addAll: vi.fn().mockResolvedValue(undefined) };
    const cacheStorage = {
      open: vi.fn().mockResolvedValue(cache),
      keys: vi.fn().mockResolvedValue(["plot-pile-shell-v2", "plot-pile-shell-development", "another-app"]),
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn(),
    };
    const { handlers, workerScope } = await loadWorker(cacheStorage);

    const install = extendableEvent();
    handlers.get("install")!(install.event);
    await install.settled();
    expect(cacheStorage.open).toHaveBeenCalledWith("plot-pile-shell-development");
    const requests = [...(cache.addAll.mock.calls[0][0] as Request[])];
    expect(requests.map((request) => request.url)).toEqual(["https://plot-pile.test/TBR-Manager/"]);
    expect(requests.map((request) => request.cache)).toEqual(["reload"]);
    expect(workerScope.skipWaiting).toHaveBeenCalled();

    const activate = extendableEvent();
    handlers.get("activate")!(activate.event);
    await activate.settled();
    expect(cacheStorage.delete.mock.calls).toEqual([["plot-pile-shell-v2"]]);
    expect(workerScope.clients.claim).toHaveBeenCalled();
  });
});
