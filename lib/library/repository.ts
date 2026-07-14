import type { Book, LibrarySnapshot, Series } from "./types";

export interface LibraryRepository {
  read(): Promise<LibrarySnapshot>;
  commitBook(book: Book, seriesToCreate?: Series): Promise<void>;
  saveSeries(series: Series): Promise<void>;
  deleteBook(id: string): Promise<void>;
  deleteSeries(id: string, updatedAt: string): Promise<void>;
  replace(snapshot: LibrarySnapshot): Promise<void>;
  merge(snapshot: LibrarySnapshot): Promise<void>;
  readMeta(key: string): Promise<string | null>;
  writeMeta(key: string, value: string): Promise<void>;
}

