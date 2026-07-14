import { describe, expect, it, vi } from "vitest";
import {
  LEGACY_COVER_META,
  LEGACY_IMPORT_META,
  LegacyLibraryClient,
  migrateLegacyLibrary,
} from "../lib/library/legacy";
import {
  isLegacyLibraryId,
  legacyBookResponse,
  legacySeriesSummary,
} from "../lib/legacy/server";
import { MemoryLibraryRepository } from "./helpers/memory-repository";
import { book, series, timestamp } from "./fixtures/library";

describe("legacy compatibility", () => {
  it("validates capability ids and maps legacy rows without leaking storage encoding", () => {
    expect(isLegacyLibraryId("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isLegacyLibraryId("not-a-library")).toBe(false);
    const seriesRow = { id: "s", name: "Saga", status: "complete", nextReleaseDate: "" };
    expect(legacySeriesSummary(seriesRow)?.status).toBe("complete");
    expect(legacyBookResponse({
      id: "b",
      libraryId: "123e4567-e89b-42d3-a456-426614174000",
      seriesId: "s",
      title: "Book",
      author: "Writer",
      reason: "",
      tags: '["Slow Burn","slow burn"]',
      coverUrl: "/api/covers/key",
      coverKey: "key",
      createdAt: timestamp,
      updatedAt: timestamp,
    }, seriesRow)).toMatchObject({ tags: ["slow burn"], series: { id: "s" } });
  });

  it("imports data once and localizes hosted covers before completion", async () => {
    const repository = new MemoryLibraryRepository();
    localStorage.setItem("plot-pile-library-id", "123e4567-e89b-42d3-a456-426614174000");
    const client = new LegacyLibraryClient();
    vi.spyOn(client, "read").mockResolvedValue({
      series: [{ id: series.id, name: series.name, status: series.status, nextReleaseDate: series.nextReleaseDate }],
      books: [{ ...book, coverUrl: "/api/covers/legacy-key", coverKey: "legacy-key" }],
    });
    vi.spyOn(client, "localizeCover").mockResolvedValue("data:image/png;base64,localized");

    const result = await migrateLegacyLibrary({
      repository,
      storage: localStorage,
      client,
      now: () => new Date(timestamp),
    });

    expect(result).toEqual({ importedBooks: 1, localizedCovers: 1, pendingCovers: 0 });
    expect(repository.snapshot.books[0].coverImage).toBe("data:image/png;base64,localized");
    expect(await repository.readMeta(LEGACY_IMPORT_META)).toBe(timestamp);
    expect(JSON.parse((await repository.readMeta(LEGACY_COVER_META))!).status).toBe("complete");
  });

  it("keeps failed covers retryable even when the earlier data marker exists", async () => {
    const repository = new MemoryLibraryRepository({
      books: [{ ...book, coverImage: "/api/covers/retry-key" }],
      series: [series],
    });
    await repository.writeMeta(LEGACY_IMPORT_META, timestamp);
    const client = new LegacyLibraryClient();
    const read = vi.spyOn(client, "read");
    vi.spyOn(client, "localizeCover").mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("data:image/png;base64,retried");

    const first = await migrateLegacyLibrary({ repository, storage: localStorage, client });
    expect(first.pendingCovers).toBe(1);
    expect(read).not.toHaveBeenCalled();
    const second = await migrateLegacyLibrary({ repository, storage: localStorage, client });
    expect(second.pendingCovers).toBe(0);
    expect(repository.snapshot.books[0].coverImage).toBe("data:image/png;base64,retried");
  });

  it("does not make a cloud request for a device without a legacy id", async () => {
    const repository = new MemoryLibraryRepository();
    const client = new LegacyLibraryClient();
    const read = vi.spyOn(client, "read");
    const result = await migrateLegacyLibrary({ repository, storage: localStorage, client });
    expect(read).not.toHaveBeenCalled();
    expect(result).toEqual({ importedBooks: 0, localizedCovers: 0, pendingCovers: 0 });
  });
});
