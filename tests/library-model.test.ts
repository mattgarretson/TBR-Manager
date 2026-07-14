import { describe, expect, it } from "vitest";
import {
  createBackup,
  currentLocalDate,
  isCalendarDate,
  nextSeriesRelease,
  normalizeTags,
  parseBackup,
  seriesNameKey,
  sortSeriesBooks,
} from "../lib/library/model";
import { book, series, snapshot, timestamp } from "./fixtures/library";
import backupV1 from "./fixtures/backup-v1.json";

describe("library domain model", () => {
  it("normalizes unlimited tags with a locale-stable key", () => {
    const tags = Array.from({ length: 40 }, (_, index) => `Trope ${index}`);
    expect(normalizeTags(["Superhero", " superhero ", "#SUPERHERO", ...tags]).slice(0, 2))
      .toEqual(["superhero", "trope 0"]);
    expect(normalizeTags(tags)).toHaveLength(40);
  });

  it("uses a stable case-insensitive series key", () => {
    expect(seriesNameKey("  The   Night Court  ")).toBe("the night court");
    expect(seriesNameKey("THE NIGHT COURT")).toBe("the night court");
  });

  it("sorts constituent books by numeric-friendly series order", () => {
    const books = [
      { ...book, id: "10", title: "Ten", seriesPosition: "10" },
      { ...book, id: "2", title: "Two", seriesPosition: "2" },
      { ...book, id: "2.5", title: "Novella", seriesPosition: "2.5" },
      { ...book, id: "unknown", title: "Unknown", seriesPosition: "" },
    ];
    expect(sortSeriesBooks(books).map((item) => item.title)).toEqual(["Two", "Novella", "Ten", "Unknown"]);
  });

  it("chooses the nearest constituent release and hides complete-series warnings", () => {
    const books = [
      { ...book, id: "later", title: "Later", releaseDate: "2027-05-10" },
      { ...book, id: "sooner", title: "Sooner", releaseDate: "2027-02-01" },
    ];
    expect(nextSeriesRelease(series, books, "2027-01-01")).toEqual({
      title: "Sooner",
      date: "2027-02-01",
      source: "book",
    });
    expect(nextSeriesRelease({ ...series, status: "complete" }, books, "2027-01-01")).toBeNull();
  });

  it("round-trips the version-one backup contract", () => {
    expect(parseBackup(createBackup(snapshot.books, snapshot.series, timestamp), timestamp)).toEqual(snapshot);
    expect(parseBackup(backupV1, timestamp)).toEqual(snapshot);
  });

  it("rejects duplicates and invalid calendar dates while unlinking orphaned books", () => {
    const backup = createBackup(snapshot.books, snapshot.series, timestamp);
    expect(() => parseBackup({ ...backup, series: [...backup.series, backup.series[0]] }, timestamp))
      .toThrow("duplicate series");
    expect(() => parseBackup({ ...backup, books: [{ ...book, releaseDate: "2027-02-30" }] }, timestamp))
      .toThrow("invalid book release date");
    expect(parseBackup({ ...backup, books: [{ ...book, seriesId: "missing" }] }, timestamp).books[0].seriesId)
      .toBeNull();
  });

  it("uses local calendar fields instead of UTC day boundaries", () => {
    expect(currentLocalDate(new Date(2027, 0, 2, 23, 59))).toBe("2027-01-02");
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});
