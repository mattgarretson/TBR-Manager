import { describe, expect, it, vi } from "vitest";
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

  it("constructs standalone TBR books and commits the batch through one repository command", async () => {
    const repository = new MemoryLibraryRepository();
    const saveBooks = vi.spyOn(repository, "saveBooks");
    const ids = ["batch-1", "batch-2"];
    const service = new LibraryService(repository, {
      now: () => new Date(timestamp),
      createId: () => ids.shift()!,
    });

    const result = await service.saveBooks([
      { title: " Book One ", author: " Writer One ", sourceUrl: "https://example.com/one" },
      { title: "Book Two", author: "Writer Two", sourceUrl: "https://example.com/two" },
    ]);

    expect(result.created).toBe(2);
    expect(saveBooks).toHaveBeenCalledOnce();
    expect(repository.snapshot.books).toEqual([
      expect.objectContaining({
        id: "batch-1",
        title: "Book One",
        author: "Writer One",
        sourceUrl: "https://example.com/one",
        seriesId: null,
        status: "tbr",
        coverImage: "",
      }),
      expect.objectContaining({
        id: "batch-2",
        title: "Book Two",
        author: "Writer Two",
        sourceUrl: "https://example.com/two",
        seriesId: null,
        status: "tbr",
        coverImage: "",
      }),
    ]);
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

  it("drops book tags that the book's series already provides", async () => {
    const romance = { ...series, id: "series-2", name: "Court Two", nameKey: "court two", tags: ["fantasy", "romance"] };
    const repository = new MemoryLibraryRepository({
      books: [{ ...book, tags: ["fantasy", "slow burn"] }],
      series: [series, romance],
    });
    const service = new LibraryService(repository, { now: () => new Date(timestamp) });

    await service.saveBook({ ...book, tags: ["fantasy", "slow burn"] });
    expect(repository.snapshot.books[0].tags).toEqual(["slow burn"]);

    await service.saveBook({ ...book, tags: ["romance", "slow burn"], seriesId: romance.id });
    expect(repository.snapshot.books[0].tags).toEqual(["slow burn"]);
  });

  it("renames only affected records and bumps their updated timestamps", async () => {
    const unaffectedBook = {
      ...book,
      id: "book-unaffected",
      title: "Romance Book",
      tags: ["romance"],
      seriesId: null,
    };
    const unaffectedSeries = {
      ...series,
      id: "series-unaffected",
      name: "Romance Series",
      nameKey: "romance series",
      tags: ["romance"],
    };
    const repository = new MemoryLibraryRepository({
      books: [{ ...book, tags: ["slow burn", "fantasy"] }, unaffectedBook],
      series: [{ ...series, tags: ["fantasy"] }, unaffectedSeries],
    });
    const saveBooksAndSeries = vi.spyOn(repository, "saveBooksAndSeries");
    const service = new LibraryService(repository, {
      now: () => new Date("2028-01-01T00:00:00.000Z"),
    });

    await service.renameTag("fantasy", "slow burn");

    const renamedBook = repository.snapshot.books.find((item) => item.id === book.id);
    const renamedSeries = repository.snapshot.series.find((item) => item.id === series.id);
    expect(renamedBook).toMatchObject({
      tags: ["slow burn"],
      updatedAt: "2028-01-01T00:00:00.000Z",
    });
    expect(renamedSeries).toMatchObject({
      tags: ["slow burn"],
      updatedAt: "2028-01-01T00:00:00.000Z",
    });
    expect(repository.snapshot.books.find((item) => item.id === unaffectedBook.id)).toEqual(unaffectedBook);
    expect(repository.snapshot.series.find((item) => item.id === unaffectedSeries.id)).toEqual(unaffectedSeries);
    expect(saveBooksAndSeries).toHaveBeenCalledOnce();
    expect(saveBooksAndSeries.mock.calls[0][0].map((item) => item.id)).toEqual([book.id]);
    expect(saveBooksAndSeries.mock.calls[0][1].map((item) => item.id)).toEqual([series.id]);
  });

  it("deletes a tag from every book and series that stores it", async () => {
    const secondBook = {
      ...book,
      id: "book-2",
      title: "Book Two",
      tags: ["fantasy"],
      seriesId: null,
    };
    const unaffectedBook = {
      ...book,
      id: "book-unaffected",
      title: "Romance Book",
      tags: ["romance"],
      seriesId: null,
    };
    const secondSeries = {
      ...series,
      id: "series-2",
      name: "Another Saga",
      nameKey: "another saga",
      tags: ["fantasy", "epic"],
    };
    const unaffectedSeries = {
      ...series,
      id: "series-unaffected",
      name: "Romance Series",
      nameKey: "romance series",
      tags: ["romance"],
    };
    const repository = new MemoryLibraryRepository({
      books: [{ ...book, tags: ["slow burn", "fantasy"] }, secondBook, unaffectedBook],
      series: [{ ...series, tags: ["fantasy"] }, secondSeries, unaffectedSeries],
    });
    const saveBooksAndSeries = vi.spyOn(repository, "saveBooksAndSeries");
    const service = new LibraryService(repository, {
      now: () => new Date("2028-01-01T00:00:00.000Z"),
    });

    await service.deleteTag(" #FaNtAsY ");

    expect(repository.snapshot.books.find((item) => item.id === book.id)).toMatchObject({
      tags: ["slow burn"],
      updatedAt: "2028-01-01T00:00:00.000Z",
    });
    expect(repository.snapshot.books.find((item) => item.id === secondBook.id)).toMatchObject({
      tags: [],
      updatedAt: "2028-01-01T00:00:00.000Z",
    });
    expect(repository.snapshot.series.find((item) => item.id === series.id)).toMatchObject({
      tags: [],
      updatedAt: "2028-01-01T00:00:00.000Z",
    });
    expect(repository.snapshot.series.find((item) => item.id === secondSeries.id)).toMatchObject({
      tags: ["epic"],
      updatedAt: "2028-01-01T00:00:00.000Z",
    });
    expect(repository.snapshot.books.find((item) => item.id === unaffectedBook.id)).toEqual(unaffectedBook);
    expect(repository.snapshot.series.find((item) => item.id === unaffectedSeries.id)).toEqual(unaffectedSeries);
    expect(saveBooksAndSeries).toHaveBeenCalledOnce();
    expect(saveBooksAndSeries.mock.calls[0][0]).toHaveLength(2);
    expect(saveBooksAndSeries.mock.calls[0][1]).toHaveLength(2);
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

  it.each(["tbr", "reading"] as const)(
    "never persists a finished date for a %s book",
    async (status) => {
      const repository = new MemoryLibraryRepository(snapshot);
      const service = new LibraryService(repository, {
        now: () => new Date("2027-03-04T12:00:00.000Z"),
      });

      await service.saveBook({
        ...book,
        status,
        finishedDate: "2027-03-03",
      });

      expect(repository.snapshot.books[0]).toMatchObject({
        status,
        finishedDate: "",
      });
    },
  );

  it("stamps the local date when a finished book has no finished date", async () => {
    const repository = new MemoryLibraryRepository(snapshot);
    const service = new LibraryService(repository, {
      now: () => new Date("2027-03-04T12:00:00.000Z"),
    });

    await service.saveBook({
      ...book,
      status: "finished",
      finishedDate: "",
    });

    expect(repository.snapshot.books[0]).toMatchObject({
      status: "finished",
      finishedDate: "2027-03-04",
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
