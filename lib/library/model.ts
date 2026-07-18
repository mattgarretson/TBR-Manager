import type { Book, BookStatus, LibraryBackup, LibrarySnapshot, Series } from "./types";

const APP_NAME = "Plot Pile" as const;
const BACKUP_VERSION = 1 as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_COVER_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_COVER_DATA_URL_LENGTH = Math.ceil(MAX_COVER_FILE_BYTES * 4 / 3) + 1024;

export function normalizeTags(tags: unknown): string[] {
  return [
    ...new Set(
      (Array.isArray(tags) ? tags : [])
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().replace(/^#/, "").toLocaleLowerCase("en-US"))
        .filter(Boolean),
    ),
  ];
}

export function cleanSeriesName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function seriesNameKey(value: unknown): string {
  return cleanSeriesName(value).normalize("NFKC").toLocaleLowerCase("en-US");
}

export function findDuplicateBook(
  books: readonly Book[],
  candidate: { id?: string; title: string; author: string },
): Book | undefined {
  const title = candidate.title.trim().toLocaleLowerCase("en-US");
  const author = candidate.author.trim().toLocaleLowerCase("en-US");
  if (!title || !author) return undefined;
  return books.find((book) =>
    book.id !== candidate.id
    && book.title.trim().toLocaleLowerCase("en-US") === title
    && book.author.trim().toLocaleLowerCase("en-US") === author,
  );
}

export function currentLocalDate(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(year, month - 1, day);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;
}

export function normalizeBookStatus(value: unknown): BookStatus {
  return value === "reading" || value === "finished" || value === "dnf" ? value : "tbr";
}

export function normalizeSourceUrl(value: unknown): string {
  const sourceUrl = typeof value === "string" ? value.trim() : "";
  if (!sourceUrl) return "";
  try {
    const parsed = new URL(sourceUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? sourceUrl : "";
  } catch {
    return "";
  }
}

export function sortSeriesBooks(books: readonly Book[]): Book[] {
  return [...books].sort((left, right) => {
    const leftPosition = left.seriesPosition.trim();
    const rightPosition = right.seriesPosition.trim();
    if (leftPosition && rightPosition) {
      const compared = leftPosition.localeCompare(rightPosition, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (compared) return compared;
    } else if (leftPosition || rightPosition) {
      return leftPosition ? -1 : 1;
    }
    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}

export function nextSeriesPosition(books: readonly Book[], seriesId: string): string {
  const linkedBooks = books.filter((book) => book.seriesId === seriesId);
  const numericPositions = linkedBooks
    .map((book) => book.seriesPosition.trim())
    .filter((position) => /^\d+(?:\.\d+)?$/.test(position))
    .map(Number)
    .filter(Number.isFinite);
  if (numericPositions.length) return String(Math.floor(Math.max(...numericPositions)) + 1);
  return String(linkedBooks.length + 1);
}

export function effectiveBookTags(book: Book, series?: Series): string[] {
  return normalizeTags([...book.tags, ...(series?.tags ?? [])]);
}

export function nextSeriesRelease(
  series: Series,
  books: readonly Book[],
  today = currentLocalDate(),
) {
  if (series.status === "complete") return null;
  const datedBooks = books
    .filter((book) => book.releaseDate && book.releaseDate >= today)
    .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate));
  if (datedBooks[0]) {
    return { title: datedBooks[0].title, date: datedBooks[0].releaseDate, source: "book" as const };
  }
  if (series.nextReleaseDate) {
    return {
      title: series.nextReleaseTitle || "Next book",
      date: series.nextReleaseDate,
      source: "series" as const,
    };
  }
  return null;
}

export function createBackup(
  books: readonly Book[],
  series: readonly Series[],
  now = new Date().toISOString(),
): LibraryBackup {
  return {
    app: APP_NAME,
    version: BACKUP_VERSION,
    exportedAt: now,
    books: books.map((book) => ({
      ...book,
      status: normalizeBookStatus(book.status),
      finishedDate: typeof book.finishedDate === "string" ? book.finishedDate : "",
      sourceUrl: normalizeSourceUrl(book.sourceUrl),
    })),
    series: [...series],
  };
}

function requiredText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("That file is not a Plot Pile backup.");
  }
  return value as Record<string, unknown>;
}

function validateOptionalDate(value: string, label: string): string {
  if (value && !isCalendarDate(value)) throw new Error(`That backup contains an invalid ${label}.`);
  return value;
}

export function parseBackup(value: unknown, now = new Date().toISOString()): LibrarySnapshot {
  const backup = record(value);
  if (backup.app !== APP_NAME || backup.version !== BACKUP_VERSION) {
    throw new Error("That backup version is not supported.");
  }
  if (!Array.isArray(backup.books) || !Array.isArray(backup.series)) {
    throw new Error("That backup is missing its books or series.");
  }

  const seriesIds = new Set<string>();
  const seriesKeys = new Set<string>();
  const series: Series[] = backup.series.map((unknownItem) => {
    const item = record(unknownItem);
    const id = requiredText(item.id);
    const name = cleanSeriesName(item.name);
    if (!id || !name) throw new Error("That backup contains an invalid series.");
    const nameKey = seriesNameKey(name);
    if (seriesIds.has(id) || seriesKeys.has(nameKey)) {
      throw new Error("That backup contains duplicate series.");
    }
    seriesIds.add(id);
    seriesKeys.add(nameKey);
    const status = item.status === "complete" ? "complete" : "incomplete";
    return {
      id,
      name,
      nameKey,
      author: requiredText(item.author).trim(),
      tags: normalizeTags(item.tags),
      status,
      nextReleaseTitle: status === "complete" ? "" : requiredText(item.nextReleaseTitle),
      nextReleaseDate: status === "complete" ? "" : validateOptionalDate(requiredText(item.nextReleaseDate), "series release date"),
      notes: requiredText(item.notes),
      createdAt: requiredText(item.createdAt, now),
      updatedAt: requiredText(item.updatedAt, now),
    };
  });

  const bookIds = new Set<string>();
  const books: Book[] = backup.books.map((unknownItem) => {
    const item = record(unknownItem);
    const id = requiredText(item.id);
    const title = requiredText(item.title).trim();
    if (!id || !title) throw new Error("That backup contains an invalid book.");
    if (bookIds.has(id)) throw new Error("That backup contains duplicate books.");
    bookIds.add(id);
    const seriesId = requiredText(item.seriesId);
    return {
      id,
      title,
      author: requiredText(item.author).trim(),
      reason: requiredText(item.reason),
      tags: normalizeTags(item.tags),
      coverImage: requiredText(item.coverImage),
      seriesId: seriesId && seriesIds.has(seriesId) ? seriesId : null,
      seriesPosition: requiredText(item.seriesPosition),
      releaseDate: validateOptionalDate(requiredText(item.releaseDate), "book release date"),
      status: normalizeBookStatus(item.status),
      finishedDate: validateOptionalDate(requiredText(item.finishedDate), "book finished date"),
      sourceUrl: normalizeSourceUrl(item.sourceUrl),
      createdAt: requiredText(item.createdAt, now),
      updatedAt: requiredText(item.updatedAt, now),
    };
  });

  if (books.some((book) => book.coverImage.startsWith("data:") && book.coverImage.length > MAX_COVER_DATA_URL_LENGTH)) {
    throw new Error("That backup contains a cover larger than Plot Pile supports.");
  }

  const seriesWithAuthors = series.map((item) => {
    if (item.author) return item;
    const linkedAuthors = [
      ...new Set(
        books
          .filter((book) => book.seriesId === item.id && book.author)
          .map((book) => book.author),
      ),
    ];
    return { ...item, author: linkedAuthors.length === 1 ? linkedAuthors[0] : "" };
  });

  return { books, series: seriesWithAuthors };
}
