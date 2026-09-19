import type { Book, LibrarySnapshot, Series } from "../../lib/library/types";

export const timestamp = "2027-01-01T12:00:00.000Z";

export const series: Series = {
  id: "series-1",
  name: "The Night Court",
  nameKey: "the night court",
  author: "A. Writer",
  tags: ["fantasy"],
  status: "incomplete",
  nextReleaseTitle: "The Last Door",
  nextReleaseDate: "2027-09-01",
  notes: "Read the novella second",
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const book: Book = {
  id: "book-1",
  title: "Book One",
  author: "A. Writer",
  reason: "Great review",
  tags: ["slow burn"],
  coverImage: "data:image/png;base64,abc",
  seriesId: series.id,
  seriesPosition: "1",
  releaseDate: "",
  status: "tbr",
  finishedDate: "",
  sourceUrl: "",
  owned: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const snapshot: LibrarySnapshot = { books: [book], series: [series] };
