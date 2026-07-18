import { describe, expect, it } from "vitest";
import { LibraryService } from "../lib/library/service";
import { MemoryLibraryRepository } from "./helpers/memory-repository";
import { book, series, snapshot, timestamp } from "./fixtures/library";

describe("LibraryService", () => {
  it("constructs a book and new series through one repository command", async () => {
    const repository = new MemoryLibraryRepository();
    const ids = ["series-new", "book-new"];
    const service = new LibraryService(repository, {
      now: () => new Date(timestamp),
      createId: () => ids.shift()!,
    });
    const result = await service.saveBook({
      title: " New Book ",
      author: " Writer ",
      reason: " Recommended ",
      tags: ["Slow Burn", "slow burn"],
      coverImage: "",
      seriesId: null,
      seriesPosition: "1",
      releaseDate: "",
      newSeries: { name: " Saga ", author: " Writer ", tags: [], status: "incomplete", nextReleaseTitle: "Next", nextReleaseDate: "2028-01-01" },
    });
    expect(result.created).toBe(true);
    expect(result.snapshot.series[0]).toMatchObject({ id: "series-new", name: "Saga", author: "Writer" });
    expect(result.snapshot.books[0]).toMatchObject({
      id: "book-new",
      seriesId: "series-new",
      tags: ["slow burn"],
      status: "tbr",
      finishedDate: "",
      sourceUrl: "",
    });
  });

  it("rejects duplicate series and preserves backup compatibility", async () => {
    const repository = new MemoryLibraryRepository(snapshot);
    const service = new LibraryService(repository, { now: () => new Date(timestamp), createId: () => "new" });
    await expect(service.saveSeries({ name: series.name.toUpperCase(), author: series.author, tags: series.tags, status: "complete", nextReleaseTitle: "", nextReleaseDate: "", notes: "" }))
      .rejects.toThrow("already exists");
    const backup = service.createBackup(snapshot);
    await repository.replace({ books: [], series: [] });
    expect(await service.restoreBackup(backup)).toEqual(snapshot);
  });

  it("creates a series and several inherited-author books atomically", async () => {
    const repository = new MemoryLibraryRepository();
    const ids = ["series-new", "book-1", "book-2"];
    const service = new LibraryService(repository, {
      now: () => new Date(timestamp),
      createId: () => ids.shift()!,
    });
    const result = await service.saveSeries({
      name: "Cradle",
      author: "Will Wight",
      tags: ["Progression", "fantasy", "progression"],
      status: "complete",
      nextReleaseTitle: "",
      nextReleaseDate: "",
      notes: "",
      books: [
        { title: "Unsouled", seriesPosition: "1" },
        { title: "Soulsmith", seriesPosition: "2" },
      ],
    });
    expect(result).toMatchObject({ created: true, booksCreated: 2 });
    expect(repository.snapshot.series[0]).toMatchObject({ id: "series-new", author: "Will Wight", tags: ["progression", "fantasy"] });
    expect(repository.snapshot.books).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "book-1", title: "Unsouled", author: "Will Wight", seriesId: "series-new", seriesPosition: "1" }),
      expect.objectContaining({ id: "book-2", title: "Soulsmith", author: "Will Wight", seriesId: "series-new", seriesPosition: "2" }),
    ]));
  });

  it("updates and deletes existing records", async () => {
    const repository = new MemoryLibraryRepository(snapshot);
    const service = new LibraryService(repository, { now: () => new Date("2028-01-01T00:00:00.000Z") });
    await service.saveBook({ ...book, title: "Updated", seriesId: book.seriesId });
    expect(repository.snapshot.books[0].title).toBe("Updated");
    await service.deleteSeries(series.id);
    expect(repository.snapshot.books[0].seriesId).toBeNull();
    expect(repository.snapshot.books[0].tags).toEqual(["slow burn", "fantasy"]);
    await service.deleteBook(book.id);
    expect(repository.snapshot.books).toEqual([]);
  });

  it("preserves inherited tags when a book leaves its series", async () => {
    const repository = new MemoryLibraryRepository(snapshot);
    const service = new LibraryService(repository, { now: () => new Date(timestamp) });
    await service.saveBook({ ...book, seriesId: null });
    expect(repository.snapshot.books[0]).toMatchObject({ seriesId: null, tags: ["slow burn", "fantasy"] });
  });

  it("preserves contract fields when an existing editor input omits them", async () => {
    const repository = new MemoryLibraryRepository({
      books: [{
        ...book,
        status: "finished",
        finishedDate: "2027-03-04",
        sourceUrl: "https://example.com/recommendation",
      }],
      series: [series],
    });
    const service = new LibraryService(repository, { now: () => new Date(timestamp) });

    await service.saveBook({
      id: book.id,
      title: book.title,
      author: book.author,
      reason: "Updated note",
      tags: book.tags,
      coverImage: book.coverImage,
      seriesId: book.seriesId,
      seriesPosition: book.seriesPosition,
      releaseDate: book.releaseDate,
    });

    expect(repository.snapshot.books[0]).toMatchObject({
      status: "finished",
      finishedDate: "2027-03-04",
      sourceUrl: "https://example.com/recommendation",
    });
  });

  it("rejects impossible calendar dates before persistence", async () => {
    const repository = new MemoryLibraryRepository();
    const service = new LibraryService(repository, { createId: () => "new" });
    await expect(service.saveBook({
      title: "Book",
      author: "Writer",
      reason: "",
      tags: [],
      coverImage: "",
      seriesId: null,
      seriesPosition: "",
      releaseDate: "2027-02-30",
    })).rejects.toThrow("valid calendar date");
    expect(repository.snapshot.books).toEqual([]);
  });
});
