import assert from "node:assert/strict";
import test from "node:test";
import {
  createBackup,
  nextSeriesRelease,
  normalizeTags,
  parseBackup,
  seriesNameKey,
  sortSeriesBooks,
} from "../app/library-model.mjs";

test("tags are unlimited, trimmed, and case-insensitive", () => {
  const tags = Array.from({ length: 40 }, (_, index) => `Trope ${index}`);
  assert.deepEqual(normalizeTags(["Superhero", " superhero ", "#SUPERHERO", ...tags]).slice(0, 2), ["superhero", "trope 0"]);
  assert.equal(normalizeTags(tags).length, 40);
});

test("series names use a stable case-insensitive key", () => {
  assert.equal(seriesNameKey("  The   Night Court  "), "the night court");
  assert.equal(seriesNameKey("THE NIGHT COURT"), "the night court");
});

test("constituent books sort by numeric-friendly series order", () => {
  const books = [
    { title: "Ten", seriesPosition: "10" },
    { title: "Two", seriesPosition: "2" },
    { title: "Novella", seriesPosition: "2.5" },
    { title: "Unknown", seriesPosition: "" },
  ];
  assert.deepEqual(sortSeriesBooks(books).map((book) => book.title), ["Two", "Novella", "Ten", "Unknown"]);
});

test("the nearest dated constituent book wins over a general series reminder", () => {
  const series = { status: "incomplete", nextReleaseTitle: "Fallback", nextReleaseDate: "2027-09-01" };
  const books = [
    { title: "Later", releaseDate: "2027-05-10" },
    { title: "Sooner", releaseDate: "2027-02-01" },
  ];
  assert.deepEqual(nextSeriesRelease(series, books, "2027-01-01"), {
    title: "Sooner",
    date: "2027-02-01",
    source: "book",
  });
});

test("complete series never show a next-release warning", () => {
  const series = { status: "complete", nextReleaseTitle: "Old reminder", nextReleaseDate: "2027-09-01" };
  assert.equal(nextSeriesRelease(series, [{ title: "Finale", releaseDate: "2027-02-01" }], "2027-01-01"), null);
});

test("backup round-tripping preserves linked books, covers, notes, and normalized tags", () => {
  const now = "2027-01-01T00:00:00.000Z";
  const series = [{ id: "s1", name: "Saga", nameKey: "saga", status: "incomplete", nextReleaseTitle: "Book 3", nextReleaseDate: "2027-03-01", notes: "Read the novella second", createdAt: now, updatedAt: now }];
  const books = [{ id: "b1", title: "Book One", author: "A. Writer", reason: "Great review", tags: ["Slow Burn", "slow burn"], coverImage: "data:image/png;base64,abc", seriesId: "s1", seriesPosition: "1", releaseDate: "", createdAt: now, updatedAt: now }];
  const restored = parseBackup(createBackup(books, series, now));
  assert.equal(restored.books[0].seriesId, "s1");
  assert.equal(restored.books[0].coverImage, "data:image/png;base64,abc");
  assert.deepEqual(restored.books[0].tags, ["slow burn"]);
  assert.equal(restored.series[0].notes, "Read the novella second");
});
