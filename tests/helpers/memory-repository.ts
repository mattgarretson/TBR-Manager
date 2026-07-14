import type { LibraryRepository } from "../../lib/library/repository";
import type { Book, LibrarySnapshot, Series } from "../../lib/library/types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryLibraryRepository implements LibraryRepository {
  snapshot: LibrarySnapshot;
  metadata = new Map<string, string>();

  constructor(snapshot: LibrarySnapshot = { books: [], series: [] }) {
    this.snapshot = clone(snapshot);
  }

  async read() {
    return clone(this.snapshot);
  }

  async commitBook(book: Book, seriesToCreate?: Series) {
    if (seriesToCreate) {
      this.snapshot.series = this.snapshot.series.filter((item) => item.id !== seriesToCreate.id);
      this.snapshot.series.push(clone(seriesToCreate));
    }
    this.snapshot.books = this.snapshot.books.filter((item) => item.id !== book.id);
    this.snapshot.books.push(clone(book));
  }

  async saveSeries(series: Series) {
    this.snapshot.series = this.snapshot.series.filter((item) => item.id !== series.id);
    this.snapshot.series.push(clone(series));
  }

  async deleteBook(id: string) {
    this.snapshot.books = this.snapshot.books.filter((item) => item.id !== id);
  }

  async deleteSeries(id: string, updatedAt: string) {
    this.snapshot.series = this.snapshot.series.filter((item) => item.id !== id);
    this.snapshot.books = this.snapshot.books.map((book) =>
      book.seriesId === id ? { ...book, seriesId: null, seriesPosition: "", updatedAt } : book,
    );
  }

  async replace(snapshot: LibrarySnapshot) {
    this.snapshot = clone(snapshot);
  }

  async merge(snapshot: LibrarySnapshot) {
    for (const series of snapshot.series) await this.saveSeries(series);
    for (const book of snapshot.books) await this.commitBook(book);
  }

  async readMeta(key: string) {
    return this.metadata.get(key) ?? null;
  }

  async writeMeta(key: string, value: string) {
    this.metadata.set(key, value);
  }
}

