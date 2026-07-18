import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("PWA contract", () => {
  it("publishes an installable manifest", async () => {
    const manifest = JSON.parse(await readFile(path.resolve(process.cwd(), "public/manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({ name: "Plot Pile", display: "standalone", start_url: "/" });
    expect(manifest.share_target).toEqual({
      action: "/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]));
  });

  it("registers install, activate, and fetch handlers", async () => {
    const source = await readFile(path.resolve(process.cwd(), "public/sw.js"), "utf8");
    const handlers = new Map<string, (event: unknown) => void>();
    const cachedShell = new Response("offline shell");
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const cacheMatch = vi.fn().mockResolvedValue(cachedShell);
    const workerScope = {
      addEventListener: vi.fn((name: string, handler: (event: unknown) => void) => handlers.set(name, handler)),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
      location: { origin: "https://plot-pile.test" },
    };
    vm.runInNewContext(source, {
      self: workerScope,
      caches: { open: vi.fn(), keys: vi.fn(), delete: vi.fn(), match: cacheMatch },
      fetch: fetcher,
      URL,
      Response,
      Promise,
    });
    expect([...handlers.keys()]).toEqual(["install", "activate", "fetch"]);

    const respondWith = vi.fn();
    handlers.get("fetch")!({
      request: { method: "GET", url: "https://plot-pile.test/library", mode: "navigate" },
      respondWith,
    });
    expect(respondWith).toHaveBeenCalledOnce();
    expect(await respondWith.mock.calls[0][0]).toBe(cachedShell);
    expect(cacheMatch).toHaveBeenCalledWith("/");

    const apiRespondWith = vi.fn();
    handlers.get("fetch")!({
      request: { method: "GET", url: "https://plot-pile.test/api/books", mode: "cors" },
      respondWith: apiRespondWith,
    });
    expect(apiRespondWith).not.toHaveBeenCalled();
  });
});
