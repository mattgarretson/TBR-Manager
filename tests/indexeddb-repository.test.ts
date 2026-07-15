import { beforeEach, describe, expect, it } from "vitest";
import {
  DATABASE_NAME,
  IndexedDbLibraryRepository,
} from "../lib/library/indexeddb-repository";
import { book, series, snapshot } from "./fixtures/library";
import type { Series } from "../lib/library/types";

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database deletion was blocked."));
  });
}

describe("IndexedDbLibraryRepository", () => {
  beforeEach(deleteDatabase);

  it("commits a new series and book atomically", async () => {
    const repository = new IndexedDbLibraryRepository();
    await repository.commitBook(book, series);
    expect(await repository.read()).toEqual(snapshot);
  });

  it("commits a series and a batch of books atomically", async () => {
    const repository = new IndexedDbLibraryRepository();
    const secondBook = { ...book, id: "book-2", title: "Book Two", seriesPosition: "2" };
    await repository.saveSeriesWithBooks(series, [book, secondBook]);
    const result = await repository.read();
    expect(result.series).toEqual([series]);
    expect(result.books).toEqual(expect.arrayContaining([book, secondBook]));
  });

  it("rolls back the book when the companion series is invalid", async () => {
    const repository = new IndexedDbLibraryRepository();
    const invalidSeries = { ...series, id: undefined } as unknown as Series;
    await expect(repository.commitBook(book, invalidSeries)).rejects.toBeTruthy();
    expect((await repository.read()).books).toEqual([]);
  });

  it("unlinks books when deleting a series", async () => {
    const repository = new IndexedDbLibraryRepository();
    await repository.commitBook(book, series);
    await repository.deleteSeries(series.id, "2028-01-01T00:00:00.000Z");
    const result = await repository.read();
    expect(result.series).toEqual([]);
    expect(result.books[0]).toMatchObject({ seriesId: null, seriesPosition: "", updatedAt: "2028-01-01T00:00:00.000Z" });
    expect(result.books[0].tags).toEqual(["slow burn", "fantasy"]);
  });

  it("replaces, idempotently merges, and stores metadata", async () => {
    const repository = new IndexedDbLibraryRepository();
    await repository.replace(snapshot);
    await repository.merge(snapshot);
    expect(await repository.read()).toEqual(snapshot);
    await repository.writeMeta("migration", "complete");
    expect(await repository.readMeta("migration")).toBe("complete");
    await repository.replace({ books: [], series: [] });
    expect(await repository.read()).toEqual({ books: [], series: [] });
  });
});
