import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDemoDependencies,
  demoExitHref,
  demoLibraryUrl,
  isDemoLaunch,
} from "../app/demo-mode";
import { parseBackup } from "../lib/library/model";
import backupV1 from "./fixtures/backup-v1.json";

const DEMO_FILE = path.resolve(import.meta.dirname, "../public/demo-library.json");

function jsonResponse(value: unknown, ok = true, status = 200) {
  return async () => ({ ok, status, json: async () => value }) as unknown as Response;
}

describe("demo mode", () => {
  it("recognizes only an affirmative demo parameter", () => {
    expect(isDemoLaunch("?demo=1")).toBe(true);
    expect(isDemoLaunch("?demo")).toBe(true);
    expect(isDemoLaunch("?demo=true&title=Shared")).toBe(true);
    expect(isDemoLaunch("")).toBe(false);
    expect(isDemoLaunch("?title=Shared")).toBe(false);
    expect(isDemoLaunch("?demo=0")).toBe(false);
    expect(isDemoLaunch("?demo=false")).toBe(false);
  });

  it("resolves the snapshot and the exit link against the deployed subpath", () => {
    expect(demoLibraryUrl("https://example.test/TBR-Manager/"))
      .toBe("https://example.test/TBR-Manager/demo-library.json");
    expect(demoLibraryUrl("https://example.test/TBR-Manager/index.html"))
      .toBe("https://example.test/TBR-Manager/demo-library.json");
    expect(demoExitHref("https://example.test/TBR-Manager/?demo=1")).toBe("/TBR-Manager/");
    expect(demoExitHref("https://example.test/TBR-Manager/?demo=1&title=Kept#series"))
      .toBe("/TBR-Manager/?title=Kept#series");
  });

  it("seeds an in-memory library that keeps the backup nudge out of the demo", async () => {
    const now = () => new Date("2027-01-01T12:00:00.000Z");
    const dependencies = await createDemoDependencies(jsonResponse(backupV1), now);

    expect(await dependencies.repository!.read()).toEqual(parseBackup(backupV1, now().toISOString()));
    expect(await dependencies.repository!.readMeta("last-backup-at")).toBe("2027-01-01T12:00:00.000Z");
    expect(dependencies.service!.shouldShowBackupNudge(25, "2027-01-01T12:00:00.000Z", null)).toBe(false);
  });

  it("reports a snapshot that could not be fetched", async () => {
    await expect(createDemoDependencies(jsonResponse(null, false, 404)))
      .rejects.toThrow("The demo library could not be loaded (404).");
  });

  it("ships a published snapshot that parses and has a cover on every book", async () => {
    const demo = JSON.parse(await readFile(DEMO_FILE, "utf8"));
    const snapshot = parseBackup(demo);

    expect(snapshot.books.length).toBeGreaterThanOrEqual(20);
    expect(snapshot.books.every((book) => book.coverImage.startsWith("data:image/"))).toBe(true);
    // The demo is published, so it carries no notes at all: not the personal ones from the
    // library it was built from, and not invented stand-ins either.
    expect(snapshot.books.every((book) => book.reason === "")).toBe(true);
    expect(snapshot.series.every((item) => item.notes === "")).toBe(true);
    // Every shelf and the owned/to-buy split need something behind them to be worth tapping.
    expect(new Set(snapshot.books.map((book) => book.status))).toEqual(new Set(["tbr", "reading", "finished"]));
    expect(snapshot.books.some((book) => book.owned)).toBe(true);
    expect(snapshot.books.some((book) => !book.owned)).toBe(true);
    expect(snapshot.series.some((item) => item.status === "incomplete")).toBe(true);
    expect(snapshot.books.every((book) => !book.seriesId || snapshot.series.some((item) => item.id === book.seriesId)))
      .toBe(true);
  });
});
