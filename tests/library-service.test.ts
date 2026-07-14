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
      newSeries: { name: " Saga ", status: "incomplete", nextReleaseTitle: "Next", nextReleaseDate: "2028-01-01" },
    });
    expect(result.created).toBe(true);
    expect(result.snapshot.series[0]).toMatchObject({ id: "series-new", name: "Saga" });
    expect(result.snapshot.books[0]).toMatchObject({ id: "book-new", seriesId: "series-new", tags: ["slow burn"] });
  });

  it("rejects duplicate series and preserves backup compatibility", async () => {
    const repository = new MemoryLibraryRepository(snapshot);
    const service = new LibraryService(repository, { now: () => new Date(timestamp), createId: () => "new" });
    await expect(service.saveSeries({ name: series.name.toUpperCase(), status: "complete", nextReleaseTitle: "", nextReleaseDate: "", notes: "" }))
      .rejects.toThrow("already exists");
    const backup = service.createBackup(snapshot);
    await repository.replace({ books: [], series: [] });
    expect(await service.restoreBackup(backup)).toEqual(snapshot);
  });

  it("updates and deletes existing records", async () => {
    const repository = new MemoryLibraryRepository(snapshot);
    const service = new LibraryService(repository, { now: () => new Date("2028-01-01T00:00:00.000Z") });
    await service.saveBook({ ...book, title: "Updated", seriesId: book.seriesId });
    expect(repository.snapshot.books[0].title).toBe("Updated");
    await service.deleteSeries(series.id);
    expect(repository.snapshot.books[0].seriesId).toBeNull();
    await service.deleteBook(book.id);
    expect(repository.snapshot.books).toEqual([]);
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
