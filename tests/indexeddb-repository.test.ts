import { beforeEach, describe, expect, it } from "vitest";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  IndexedDbLibraryRepository,
} from "../lib/library/indexeddb-repository";
import {
  BACKUP_NUDGE_SNOOZED_UNTIL_META,
  LAST_BACKUP_AT_META,
} from "../lib/library/repository";
import { book, series, snapshot } from "./fixtures/library";
import type { Book, Series } from "../lib/library/types";

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database deletion was blocked."));
  });
}

function putStoredBook(value: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("books", "readwrite");
      transaction.objectStore("books").put(value);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}

describe("IndexedDbLibraryRepository", () => {
  beforeEach(deleteDatabase);

  it("keeps the original database identity and schema version", () => {
    expect(DATABASE_NAME).toBe("plot-pile-library");
    expect(DATABASE_VERSION).toBe(1);
  });

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

  it("commits standalone books in one batch and rolls the whole transaction back on failure", async () => {
    const repository = new IndexedDbLibraryRepository();
    const secondBook = { ...book, id: "book-2", title: "Book Two", seriesId: null };
    await repository.saveBooks([book, secondBook]);
    expect((await repository.read()).books).toEqual(expect.arrayContaining([book, secondBook]));

    await repository.replace({ books: [], series: [] });
    const invalidBook = { ...secondBook, id: undefined } as unknown as Book;
    await expect(repository.saveBooks([book, invalidBook])).rejects.toBeTruthy();
    expect(await repository.read()).toEqual({ books: [], series: [] });
  });

  it("updates the given books and series while leaving unrelated stored records untouched", async () => {
    const repository = new IndexedDbLibraryRepository();
    const unrelatedSeries = {
      ...series,
      id: "series-unrelated",
      name: "Another Saga",
      nameKey: "another saga",
      tags: ["romance"],
    };
    const unrelatedBook = {
      ...book,
      id: "book-unrelated",
      title: "Another Book",
      tags: ["romance"],
      seriesId: unrelatedSeries.id,
    };
    await repository.replace({
      books: [book, unrelatedBook],
      series: [series, unrelatedSeries],
    });
    const updatedBook = {
      ...book,
      tags: ["slow burn", "fantasy"],
      updatedAt: "2028-01-01T00:00:00.000Z",
    };
    const updatedSeries = {
      ...series,
      tags: ["epic fantasy"],
      updatedAt: "2028-01-01T00:00:00.000Z",
    };

    await repository.saveBooksAndSeries([updatedBook], [updatedSeries]);

    const result = await repository.read();
    expect(result.books).toHaveLength(2);
    expect(result.series).toHaveLength(2);
    expect(result.books.find((item) => item.id === updatedBook.id)).toEqual(updatedBook);
    expect(result.series.find((item) => item.id === updatedSeries.id)).toEqual(updatedSeries);
    expect(result.books.find((item) => item.id === unrelatedBook.id)).toEqual(unrelatedBook);
    expect(result.series.find((item) => item.id === unrelatedSeries.id)).toEqual(unrelatedSeries);
  });

  it("updates book and series records together and rolls back the bulk transaction on failure", async () => {
    const repository = new IndexedDbLibraryRepository();
    await repository.replace(snapshot);
    const updatedBook = { ...book, tags: ["fantasy"], updatedAt: "2028-01-01T00:00:00.000Z" };
    const updatedSeries = { ...series, tags: ["fantasy", "epic"], updatedAt: "2028-01-01T00:00:00.000Z" };

    await repository.saveBooksAndSeries([updatedBook], [updatedSeries]);
    expect(await repository.read()).toEqual({ books: [updatedBook], series: [updatedSeries] });

    const invalidSeries = { ...updatedSeries, id: undefined } as unknown as Series;
    await expect(repository.saveBooksAndSeries(
      [{ ...updatedBook, title: "This must roll back" }],
      [invalidSeries],
    )).rejects.toBeTruthy();
    expect(await repository.read()).toEqual({ books: [updatedBook], series: [updatedSeries] });
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

  it("normalizes new book fields when reading an existing version-one record", async () => {
    const repository = new IndexedDbLibraryRepository();
    await repository.replace({ books: [], series: [] });
    const storedBook = { ...book } as Record<string, unknown>;
    delete storedBook.status;
    delete storedBook.finishedDate;
    delete storedBook.sourceUrl;
    await putStoredBook(storedBook);

    expect((await repository.read()).books).toEqual([book]);
  });

  it("replaces the library and stores metadata", async () => {
    const repository = new IndexedDbLibraryRepository();
    await repository.replace(snapshot);
    expect(await repository.read()).toEqual(snapshot);
    expect(LAST_BACKUP_AT_META).toBe("last-backup-at");
    expect(BACKUP_NUDGE_SNOOZED_UNTIL_META).toBe("backup-nudge-snoozed-until");
    await repository.writeMeta(LAST_BACKUP_AT_META, "2027-01-01T12:00:00.000Z");
    await repository.writeMeta(BACKUP_NUDGE_SNOOZED_UNTIL_META, "2027-01-08");
    expect(await repository.readMeta(LAST_BACKUP_AT_META)).toBe("2027-01-01T12:00:00.000Z");
    expect(await repository.readMeta(BACKUP_NUDGE_SNOOZED_UNTIL_META)).toBe("2027-01-08");
    await repository.replace({ books: [], series: [] });
    expect(await repository.read()).toEqual({ books: [], series: [] });
  });
});
