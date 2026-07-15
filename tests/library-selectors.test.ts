import { describe, expect, it } from "vitest";
import {
  selectAllSeriesCards,
  selectSeriesCards,
  selectTagCounts,
  selectVisibleBooks,
} from "../lib/library/selectors";
import { book, series } from "./fixtures/library";

const standalone = {
  ...book,
  id: "standalone",
  title: "Zebra Book",
  author: "B. Author",
  tags: ["found family", "slow burn"],
  seriesId: null,
  releaseDate: "2027-03-01",
  createdAt: "2027-02-01T00:00:00.000Z",
};

describe("library selectors", () => {
  it("counts and orders tags", () => {
    expect(selectTagCounts([book, standalone], [series])).toEqual([
      ["slow burn", 2],
      ["fantasy", 1],
      ["found family", 1],
    ]);
  });

  it.each([
    ["standalone", ["standalone"]],
    ["incomplete", ["book-1"]],
    ["upcoming", ["standalone"]],
  ] as const)("filters the %s book scope", (scope, ids) => {
    const result = selectVisibleBooks({
      books: [book, standalone],
      series: [series],
      query: "",
      activeTag: "All",
      scope,
      sort: "title",
      direction: "asc",
      today: "2027-01-01",
    });
    expect(result.map((item) => item.id)).toEqual(ids);
  });

  it("searches linked series and sorts in both directions", () => {
    const input = {
      books: [book, standalone],
      series: [series],
      activeTag: "All",
      scope: "all" as const,
      sort: "title" as const,
      today: "2027-01-01",
    };
    expect(selectVisibleBooks({ ...input, query: "night court", direction: "asc" }).map((item) => item.id))
      .toEqual([book.id]);
    expect(selectVisibleBooks({ ...input, query: "fantasy", direction: "asc" }).map((item) => item.id))
      .toEqual([book.id]);
    expect(selectVisibleBooks({ ...input, query: "", activeTag: "fantasy", direction: "asc" }).map((item) => item.id))
      .toEqual([book.id]);
    expect(selectVisibleBooks({ ...input, query: "", direction: "desc" }).map((item) => item.id))
      .toEqual([standalone.id, book.id]);
  });

  it("builds, filters, and sorts series cards", () => {
    const complete = { ...series, id: "series-2", name: "Alpha", nameKey: "alpha", status: "complete" as const };
    const cards = selectAllSeriesCards([series, complete], [book], "2027-01-01");
    expect(cards[0].books).toHaveLength(1);
    expect(selectSeriesCards({ cards, query: "Book One", scope: "all", sort: "name", direction: "asc" }))
      .toHaveLength(1);
    expect(selectSeriesCards({ cards, query: "A. Writer", scope: "all", sort: "name", direction: "asc" }))
      .toHaveLength(2);
    expect(selectSeriesCards({ cards, query: "fantasy", scope: "all", sort: "name", direction: "asc" }))
      .toHaveLength(2);
    expect(selectSeriesCards({ cards, query: "", scope: "complete", sort: "name", direction: "asc" })[0].item.id)
      .toBe(complete.id);
  });
});
