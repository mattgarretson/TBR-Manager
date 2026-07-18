import type { Book, LibrarySnapshot, Series } from "./types";

export const LAST_BACKUP_AT_META = "last-backup-at";
export const BACKUP_NUDGE_SNOOZED_UNTIL_META = "backup-nudge-snoozed-until";

export interface LibraryRepository {
  read(): Promise<LibrarySnapshot>;
  commitBook(book: Book, seriesToCreate?: Series): Promise<void>;
  saveSeries(series: Series): Promise<void>;
  saveSeriesWithBooks(series: Series, books: Book[]): Promise<void>;
  deleteBook(id: string): Promise<void>;
  deleteSeries(id: string, updatedAt: string): Promise<void>;
  replace(snapshot: LibrarySnapshot): Promise<void>;
  merge(snapshot: LibrarySnapshot): Promise<void>;
  readMeta(key: string): Promise<string | null>;
  writeMeta(key: string, value: string): Promise<void>;
}
