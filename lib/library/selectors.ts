import { effectiveBookTags, nextSeriesRelease, sortSeriesBooks } from "./model";
import type {
  Book,
  BookScope,
  BookShelf,
  BookSort,
  Series,
  SeriesScope,
  SeriesSort,
  SortDirection,
} from "./types";

export type SeriesCard = {
  item: Series;
  books: Book[];
  next: ReturnType<typeof nextSeriesRelease>;
};

function compareText(left: string, right: string, direction: SortDirection) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * (direction === "asc" ? 1 : -1);
}

function compareOptional(left: string, right: string, direction: SortDirection) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return compareText(left, right, direction);
}

export function selectTagCounts(books: readonly Book[], series: readonly Series[]): [string, number][] {
  const counts = new Map<string, number>();
  const seriesMap = new Map(series.map((item) => [item.id, item]));
  books.forEach((book) => effectiveBookTags(book, book.seriesId ? seriesMap.get(book.seriesId) : undefined)
    .forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

export function selectStoredTagCounts(books: readonly Book[], series: readonly Series[]): [string, number][] {
  const counts = new Map<string, number>();
  [...books, ...series].forEach((item) => item.tags.forEach((tag) =>
    counts.set(tag, (counts.get(tag) ?? 0) + 1),
  ));
  return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}

export function selectVisibleBooks(input: {
  books: readonly Book[];
  series: readonly Series[];
  query: string;
  activeTag: string;
  shelf: BookShelf;
  scope: BookScope;
  sort: BookSort;
  direction: SortDirection;
  today: string;
}): Book[] {
  const { books, series, query, activeTag, shelf, scope, sort, direction, today } = input;
  const seriesMap = new Map(series.map((item) => [item.id, item]));
  const needle = query.trim().toLocaleLowerCase("en-US");
  return books
    .filter((book) => {
      const linkedSeries = book.seriesId ? seriesMap.get(book.seriesId) : undefined;
      const tags = effectiveBookTags(book, linkedSeries);
      const shelfMatches =
        shelf === "all" ||
        shelf === book.status ||
        (shelf === "done" && (book.status === "finished" || book.status === "dnf"));
      const scopeMatches =
        scope === "all" ||
        (scope === "standalone" && !linkedSeries) ||
        (scope === "complete" && linkedSeries?.status === "complete") ||
        (scope === "incomplete" && linkedSeries?.status === "incomplete") ||
        (scope === "upcoming" && Boolean(book.releaseDate && book.releaseDate >= today));
      const tagMatches = activeTag === "All" || tags.includes(activeTag);
      const searchMatches =
        !needle ||
        [book.title, book.author, book.reason, linkedSeries?.name ?? "", book.seriesPosition, ...tags]
          .join(" ")
          .toLocaleLowerCase("en-US")
          .includes(needle);
      return shelfMatches && scopeMatches && tagMatches && searchMatches;
    })
    .sort((left, right) => {
      const leftSeries = left.seriesId ? seriesMap.get(left.seriesId)?.name ?? "" : "";
      const rightSeries = right.seriesId ? seriesMap.get(right.seriesId)?.name ?? "" : "";
      if (sort === "title") return compareText(left.title, right.title, direction);
      if (sort === "author") return compareText(left.author, right.author, direction);
      if (sort === "series") return compareOptional(leftSeries, rightSeries, direction);
      if (sort === "releaseDate") return compareOptional(left.releaseDate, right.releaseDate, direction);
      if (sort === "seriesPosition") return compareOptional(left.seriesPosition, right.seriesPosition, direction);
      return compareText(left.createdAt, right.createdAt, direction);
    });
}

export function selectAllSeriesCards(
  series: readonly Series[],
  books: readonly Book[],
  today: string,
): SeriesCard[] {
  const grouped = new Map<string, Book[]>();
  books.forEach((book) => {
    if (!book.seriesId) return;
    const current = grouped.get(book.seriesId) ?? [];
    current.push(book);
    grouped.set(book.seriesId, current);
  });
  return series.map((item) => {
    const linkedBooks = sortSeriesBooks(grouped.get(item.id) ?? []);
    return { item, books: linkedBooks, next: nextSeriesRelease(item, linkedBooks, today) };
  });
}

export function selectSeriesCards(input: {
  cards: readonly SeriesCard[];
  query: string;
  scope: SeriesScope;
  sort: SeriesSort;
  direction: SortDirection;
}): SeriesCard[] {
  const { cards, query, scope, sort, direction } = input;
  const needle = query.trim().toLocaleLowerCase("en-US");
  return cards
    .filter(({ item, books, next }) => {
      const scopeMatches = scope === "all" || item.status === scope || (scope === "upcoming" && Boolean(next));
      const searchMatches =
        !needle ||
        [item.name, item.author, item.notes, ...item.tags, ...books.flatMap((book) => [book.title, book.author])]
          .join(" ")
          .toLocaleLowerCase("en-US")
          .includes(needle);
      return scopeMatches && searchMatches;
    })
    .sort((left, right) => {
      if (sort === "books") {
        const compared = (left.books.length - right.books.length) * (direction === "asc" ? 1 : -1);
        return compared || compareText(left.item.name, right.item.name, "asc");
      }
      if (sort === "nextRelease") return compareOptional(left.next?.date ?? "", right.next?.date ?? "", direction);
      if (sort === "updatedAt") return compareText(left.item.updatedAt, right.item.updatedAt, direction);
      return compareText(left.item.name, right.item.name, direction);
    });
}
