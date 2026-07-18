import {
  cleanSeriesName,
  createBackup,
  currentLocalDate,
  isCalendarDate,
  normalizeBookStatus,
  normalizeSourceUrl,
  normalizeTags,
  parseBackup,
  removeTag,
  renameTag as renameStoredTag,
  seriesNameKey,
} from "./model";
import type { LibraryRepository } from "./repository";
import type {
  Book,
  LibraryBackup,
  LibrarySnapshot,
  SaveBookInput,
  SaveSeriesInput,
  Series,
} from "./types";

export type LibraryServiceDependencies = {
  now?: () => Date;
  createId?: () => string;
};

export class LibraryService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly repository: LibraryRepository,
    dependencies: LibraryServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
  }

  read() {
    return this.repository.read();
  }

  async saveBook(input: SaveBookInput): Promise<{ snapshot: LibrarySnapshot; created: boolean }> {
    const snapshot = await this.repository.read();
    const existing = input.id ? snapshot.books.find((book) => book.id === input.id) : undefined;
    if (input.id && !existing) throw new Error("That book no longer exists.");

    const title = input.title.trim();
    const author = input.author.trim();
    if (!title || !author) throw new Error("Add both a title and an author.");
    if (input.releaseDate && !isCalendarDate(input.releaseDate)) {
      throw new Error("Book release date must be a valid calendar date.");
    }
    const currentTime = this.now();
    const status = normalizeBookStatus(input.status ?? existing?.status);
    const requestedFinishedDate = input.finishedDate ?? existing?.finishedDate ?? "";
    const finishedDate = status === "finished" || status === "dnf"
      ? requestedFinishedDate || currentLocalDate(currentTime)
      : "";
    if (finishedDate && !isCalendarDate(finishedDate)) {
      throw new Error("Book finished date must be a valid calendar date.");
    }
    const requestedSourceUrl = input.sourceUrl ?? existing?.sourceUrl ?? "";
    const sourceUrl = normalizeSourceUrl(requestedSourceUrl);
    if (requestedSourceUrl.trim() && !sourceUrl) {
      throw new Error("Where I found it must be a valid HTTP or HTTPS URL.");
    }

    const now = currentTime.toISOString();
    let seriesId = input.seriesId;
    let seriesToCreate: Series | undefined;
    if (input.newSeries) {
      const name = cleanSeriesName(input.newSeries.name);
      if (!name) throw new Error("Give the new series a name.");
      const nameKey = seriesNameKey(name);
      if (snapshot.series.some((item) => item.nameKey === nameKey)) {
        throw new Error("That series already exists. Choose it from the series list instead.");
      }
      if (input.newSeries.status === "incomplete" && input.newSeries.nextReleaseDate && !isCalendarDate(input.newSeries.nextReleaseDate)) {
        throw new Error("Next release date must be a valid calendar date.");
      }
      seriesToCreate = {
        id: this.createId(),
        name,
        nameKey,
        author: input.newSeries.author.trim() || author,
        tags: normalizeTags(input.newSeries.tags),
        status: input.newSeries.status,
        nextReleaseTitle: input.newSeries.status === "incomplete" ? input.newSeries.nextReleaseTitle.trim() : "",
        nextReleaseDate: input.newSeries.status === "incomplete" ? input.newSeries.nextReleaseDate : "",
        notes: "",
        createdAt: now,
        updatedAt: now,
      };
      seriesId = seriesToCreate.id;
    }

    let tags = normalizeTags(input.tags);
    if (existing?.seriesId && existing.seriesId !== seriesId) {
      const previousSeries = snapshot.series.find((item) => item.id === existing.seriesId);
      tags = normalizeTags([...tags, ...(previousSeries?.tags ?? [])]);
    }
    const book: Book = {
      id: existing?.id ?? this.createId(),
      title,
      author,
      reason: input.reason.trim(),
      tags,
      coverImage: input.coverImage.trim(),
      seriesId: seriesId || null,
      seriesPosition: seriesId ? input.seriesPosition.trim() : "",
      releaseDate: input.releaseDate,
      status,
      finishedDate,
      sourceUrl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repository.commitBook(book, seriesToCreate);
    return { snapshot: await this.repository.read(), created: !existing };
  }

  async saveSeries(input: SaveSeriesInput): Promise<{ snapshot: LibrarySnapshot; created: boolean; booksCreated: number }> {
    const snapshot = await this.repository.read();
    const existing = input.id ? snapshot.series.find((series) => series.id === input.id) : undefined;
    if (input.id && !existing) throw new Error("That series no longer exists.");
    const name = cleanSeriesName(input.name);
    if (!name) throw new Error("Give the series a name.");
    const nameKey = seriesNameKey(name);
    const author = input.author.trim();
    if (snapshot.series.some((item) => item.id !== input.id && item.nameKey === nameKey)) {
      throw new Error("A series with that name already exists.");
    }
    if (input.status === "incomplete" && input.nextReleaseDate && !isCalendarDate(input.nextReleaseDate)) {
      throw new Error("Next release date must be a valid calendar date.");
    }
    const now = this.now().toISOString();
    const requestedBooks = input.books ?? [];
    if (requestedBooks.length && !author) {
      throw new Error("Add the series author before creating its books.");
    }
    const seriesId = existing?.id ?? this.createId();
    const series: Series = {
      id: seriesId,
      name,
      nameKey,
      author,
      tags: normalizeTags(input.tags),
      status: input.status,
      nextReleaseTitle: input.status === "incomplete" ? input.nextReleaseTitle.trim() : "",
      nextReleaseDate: input.status === "incomplete" ? input.nextReleaseDate : "",
      notes: input.notes.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const positions = new Set<string>();
    const books: Book[] = requestedBooks.map((item) => {
      const title = item.title.trim();
      const seriesPosition = item.seriesPosition.trim();
      if (!title) throw new Error("Every book in the series needs a title.");
      if (seriesPosition && positions.has(seriesPosition)) {
        throw new Error(`Book position ${seriesPosition} appears more than once.`);
      }
      if (seriesPosition) positions.add(seriesPosition);
      return {
        id: this.createId(),
        title,
        author,
        reason: "",
        tags: [],
        coverImage: "",
        seriesId,
        seriesPosition,
        releaseDate: "",
        status: "tbr",
        finishedDate: "",
        sourceUrl: "",
        createdAt: now,
        updatedAt: now,
      };
    });
    if (books.length) await this.repository.saveSeriesWithBooks(series, books);
    else await this.repository.saveSeries(series);
    return { snapshot: await this.repository.read(), created: !existing, booksCreated: books.length };
  }

  async deleteBook(id: string) {
    await this.repository.deleteBook(id);
    return this.repository.read();
  }

  async restoreBook(book: Book) {
    await this.repository.commitBook(book);
    return this.repository.read();
  }

  async renameTag(currentTag: string, nextTag: string) {
    const source = normalizeTags([currentTag])[0];
    const target = normalizeTags([nextTag])[0];
    if (!source || !target) throw new Error("Enter a tag name.");
    const snapshot = await this.repository.read();
    if (source === target) return snapshot;
    const updatedAt = this.now().toISOString();
    const books = snapshot.books
      .filter((book) => normalizeTags(book.tags).includes(source))
      .map((book) => ({ ...book, tags: renameStoredTag(book.tags, source, target), updatedAt }));
    const series = snapshot.series
      .filter((item) => normalizeTags(item.tags).includes(source))
      .map((item) => ({ ...item, tags: renameStoredTag(item.tags, source, target), updatedAt }));
    await this.repository.saveBooksAndSeries(books, series);
    return this.repository.read();
  }

  async deleteTag(tag: string) {
    const target = normalizeTags([tag])[0];
    if (!target) throw new Error("Choose a tag to delete.");
    const snapshot = await this.repository.read();
    const updatedAt = this.now().toISOString();
    const books = snapshot.books
      .filter((book) => normalizeTags(book.tags).includes(target))
      .map((book) => ({ ...book, tags: removeTag(book.tags, target), updatedAt }));
    const series = snapshot.series
      .filter((item) => normalizeTags(item.tags).includes(target))
      .map((item) => ({ ...item, tags: removeTag(item.tags, target), updatedAt }));
    await this.repository.saveBooksAndSeries(books, series);
    return this.repository.read();
  }

  async deleteSeries(id: string) {
    await this.repository.deleteSeries(id, this.now().toISOString());
    return this.repository.read();
  }

  createBackup(snapshot: LibrarySnapshot): LibraryBackup {
    return createBackup(snapshot.books, snapshot.series, this.now().toISOString());
  }

  async restoreBackup(value: unknown) {
    const snapshot = parseBackup(value, this.now().toISOString());
    await this.repository.replace(snapshot);
    return this.repository.read();
  }

  async erase() {
    await this.repository.replace({ books: [], series: [] });
    return this.repository.read();
  }
}
