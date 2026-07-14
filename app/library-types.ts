export type SeriesStatus = "complete" | "incomplete";

export type LocalSeries = {
  id: string;
  name: string;
  nameKey: string;
  status: SeriesStatus;
  nextReleaseTitle: string;
  nextReleaseDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalBook = {
  id: string;
  title: string;
  author: string;
  reason: string;
  tags: string[];
  coverImage: string;
  seriesId: string | null;
  seriesPosition: string;
  releaseDate: string;
  createdAt: string;
  updatedAt: string;
};

export type LibrarySnapshot = {
  books: LocalBook[];
  series: LocalSeries[];
};

export type LibraryBackup = LibrarySnapshot & {
  app: "Plot Pile";
  version: 1;
  exportedAt: string;
};
