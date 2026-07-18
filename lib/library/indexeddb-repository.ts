import type { LibraryRepository } from "./repository";
import type { Book, LibrarySnapshot, Series } from "./types";
import { normalizeBookStatus, normalizeSourceUrl, normalizeTags } from "./model";

export const DATABASE_NAME = "plot-pile-library";
export const DATABASE_VERSION = 1;
const BOOKS_STORE = "books";
const SERIES_STORE = "series";
const META_STORE = "meta";

type MetaRecord = { key: string; value: string };
type StoredBook = Omit<Book, "status" | "finishedDate" | "sourceUrl"> & {
  status?: unknown;
  finishedDate?: unknown;
  sourceUrl?: unknown;
};

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Local storage transaction was cancelled."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Local storage transaction failed."));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BOOKS_STORE)) {
        const books = database.createObjectStore(BOOKS_STORE, { keyPath: "id" });
        books.createIndex("seriesId", "seriesId", { unique: false });
        books.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(SERIES_STORE)) {
        const series = database.createObjectStore(SERIES_STORE, { keyPath: "id" });
        series.createIndex("nameKey", "nameKey", { unique: false });
        series.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the on-device library."));
  });
}

export class IndexedDbLibraryRepository implements LibraryRepository {
  async read(): Promise<LibrarySnapshot> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([BOOKS_STORE, SERIES_STORE], "readonly");
      const completed = transactionDone(transaction);
      const booksRequest = transaction.objectStore(BOOKS_STORE).getAll() as IDBRequest<StoredBook[]>;
      const seriesRequest = transaction.objectStore(SERIES_STORE).getAll() as IDBRequest<Series[]>;
      const [storedBooks, storedSeries] = await Promise.all([requestValue(booksRequest), requestValue(seriesRequest)]);
      await completed;
      const books: Book[] = storedBooks.map((item) => ({
        ...item,
        status: normalizeBookStatus(item.status),
        finishedDate: typeof item.finishedDate === "string" ? item.finishedDate : "",
        sourceUrl: normalizeSourceUrl(item.sourceUrl),
      }));
      const series = storedSeries.map((item) => {
        const linkedAuthors = [
          ...new Set(
            books
              .filter((book) => book.seriesId === item.id && book.author)
              .map((book) => book.author),
          ),
        ];
        return {
          ...item,
          author: item.author || (linkedAuthors.length === 1 ? linkedAuthors[0] : ""),
          tags: normalizeTags(item.tags),
        };
      });
      return { books, series };
    } finally {
      database.close();
    }
  }

  async commitBook(book: Book, seriesToCreate?: Series) {
    const database = await openDatabase();
    try {
      const stores = seriesToCreate ? [BOOKS_STORE, SERIES_STORE] : [BOOKS_STORE];
      const transaction = database.transaction(stores, "readwrite");
      const completed = transactionDone(transaction);
      if (seriesToCreate) transaction.objectStore(SERIES_STORE).put(seriesToCreate);
      transaction.objectStore(BOOKS_STORE).put(book);
      await completed;
    } finally {
      database.close();
    }
  }

  async saveBooks(books: Book[]) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BOOKS_STORE, "readwrite");
      const completed = transactionDone(transaction);
      try {
        const bookStore = transaction.objectStore(BOOKS_STORE);
        books.forEach((book) => bookStore.put(book));
      } catch (caught) {
        transaction.abort();
        await completed.catch(() => {});
        throw caught;
      }
      await completed;
    } finally {
      database.close();
    }
  }

  async saveSeries(series: Series) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(SERIES_STORE, "readwrite");
      const completed = transactionDone(transaction);
      transaction.objectStore(SERIES_STORE).put(series);
      await completed;
    } finally {
      database.close();
    }
  }

  async saveSeriesWithBooks(series: Series, books: Book[]) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([BOOKS_STORE, SERIES_STORE], "readwrite");
      const completed = transactionDone(transaction);
      transaction.objectStore(SERIES_STORE).put(series);
      const bookStore = transaction.objectStore(BOOKS_STORE);
      books.forEach((book) => bookStore.put(book));
      await completed;
    } finally {
      database.close();
    }
  }

  async saveBooksAndSeries(books: Book[], series: Series[]) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([BOOKS_STORE, SERIES_STORE], "readwrite");
      const completed = transactionDone(transaction);
      try {
        const bookStore = transaction.objectStore(BOOKS_STORE);
        const seriesStore = transaction.objectStore(SERIES_STORE);
        books.forEach((book) => bookStore.put(book));
        series.forEach((item) => seriesStore.put(item));
      } catch (caught) {
        transaction.abort();
        await completed.catch(() => {});
        throw caught;
      }
      await completed;
    } finally {
      database.close();
    }
  }

  async deleteBook(id: string) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(BOOKS_STORE, "readwrite");
      const completed = transactionDone(transaction);
      transaction.objectStore(BOOKS_STORE).delete(id);
      await completed;
    } finally {
      database.close();
    }
  }

  async deleteSeries(id: string, updatedAt: string) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([BOOKS_STORE, SERIES_STORE], "readwrite");
      const completed = transactionDone(transaction);
      const bookStore = transaction.objectStore(BOOKS_STORE);
      const seriesStore = transaction.objectStore(SERIES_STORE);
      const linkedRequest = bookStore.index("seriesId").getAll(id) as IDBRequest<Book[]>;
      const seriesRequest = seriesStore.get(id) as IDBRequest<Series | undefined>;
      const [linkedBooks, removedSeries] = await Promise.all([
        requestValue(linkedRequest),
        requestValue(seriesRequest),
      ]);
      linkedBooks.forEach((book) =>
        bookStore.put({
          ...book,
          tags: normalizeTags([...book.tags, ...(removedSeries?.tags ?? [])]),
          seriesId: null,
          seriesPosition: "",
          updatedAt,
        }),
      );
      seriesStore.delete(id);
      await completed;
    } finally {
      database.close();
    }
  }

  async replace(snapshot: LibrarySnapshot) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([BOOKS_STORE, SERIES_STORE], "readwrite");
      const completed = transactionDone(transaction);
      const bookStore = transaction.objectStore(BOOKS_STORE);
      const seriesStore = transaction.objectStore(SERIES_STORE);
      bookStore.clear();
      seriesStore.clear();
      snapshot.series.forEach((item) => seriesStore.put(item));
      snapshot.books.forEach((item) => bookStore.put(item));
      await completed;
    } finally {
      database.close();
    }
  }

  async merge(snapshot: LibrarySnapshot) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([BOOKS_STORE, SERIES_STORE], "readwrite");
      const completed = transactionDone(transaction);
      const bookStore = transaction.objectStore(BOOKS_STORE);
      const seriesStore = transaction.objectStore(SERIES_STORE);
      snapshot.series.forEach((item) => seriesStore.put(item));
      snapshot.books.forEach((item) => bookStore.put(item));
      await completed;
    } finally {
      database.close();
    }
  }

  async readMeta(key: string) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(META_STORE, "readonly");
      const completed = transactionDone(transaction);
      const record = await requestValue(
        transaction.objectStore(META_STORE).get(key) as IDBRequest<MetaRecord | undefined>,
      );
      await completed;
      return record?.value ?? null;
    } finally {
      database.close();
    }
  }

  async writeMeta(key: string, value: string) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(META_STORE, "readwrite");
      const completed = transactionDone(transaction);
      transaction.objectStore(META_STORE).put({ key, value } satisfies MetaRecord);
      await completed;
    } finally {
      database.close();
    }
  }
}
