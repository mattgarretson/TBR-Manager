export type SeriesStatus = "complete" | "incomplete";
export type BookStatus = "tbr" | "reading" | "finished" | "dnf";

export type Series = {
  id: string;
  name: string;
  nameKey: string;
  author: string;
  tags: string[];
  status: SeriesStatus;
  nextReleaseTitle: string;
  nextReleaseDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  reason: string;
  tags: string[];
  coverImage: string;
  seriesId: string | null;
  seriesPosition: string;
  releaseDate: string;
  status: BookStatus;
  finishedDate: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type LibrarySnapshot = {
  books: Book[];
  series: Series[];
};

export type LibraryBackup = LibrarySnapshot & {
  app: "Plot Pile";
  version: 1;
  exportedAt: string;
};

export type ViewName = "library" | "series" | "settings";
export type ThemeName = "bookshop" | "forest" | "ocean" | "lavender";
export type BookShelf = "tbr" | "reading" | "done" | "all";
export type BookScope = "all" | "standalone" | "incomplete" | "complete" | "upcoming";
export type SeriesScope = "all" | "incomplete" | "complete" | "upcoming";
export type SortDirection = "asc" | "desc";
export type BookSort = "createdAt" | "title" | "author" | "series" | "seriesPosition" | "releaseDate";
export type SeriesSort = "name" | "books" | "nextRelease" | "updatedAt";

export type NewSeriesInput = {
  name: string;
  author: string;
  tags: string[];
  status: SeriesStatus;
  nextReleaseTitle: string;
  nextReleaseDate: string;
};

export type SaveSeriesBookInput = {
  title: string;
  seriesPosition: string;
};

export type SaveBookInput = {
  id?: string;
  title: string;
  author: string;
  reason: string;
  tags: string[];
  coverImage: string;
  seriesId: string | null;
  seriesPosition: string;
  releaseDate: string;
  status?: BookStatus;
  finishedDate?: string;
  sourceUrl?: string;
  newSeries?: NewSeriesInput;
};

export type SaveSeriesInput = {
  id?: string;
  name: string;
  author: string;
  tags: string[];
  status: SeriesStatus;
  nextReleaseTitle: string;
  nextReleaseDate: string;
  notes: string;
  books?: SaveSeriesBookInput[];
};

export type LegacySeries = {
  id: string;
  name: string;
  status: SeriesStatus;
  nextReleaseDate: string;
};

export type LegacyBook = {
  id: string;
  seriesId: string | null;
  title: string;
  author: string;
  reason: string;
  tags: string[];
  coverUrl: string;
  coverKey?: string;
  createdAt: string;
  updatedAt: string;
};
