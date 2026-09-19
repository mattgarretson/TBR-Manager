import type {
  BookOwnership,
  BookScope,
  BookShelf,
  BookSort,
  SeriesScope,
  SeriesSort,
  SortDirection,
} from "../../lib/library/types";

export const LIBRARY_VIEW_PREFERENCES_KEY = "plot-pile-library-view";
export const SERIES_VIEW_PREFERENCES_KEY = "plot-pile-series-view";

export type LibraryViewPreferences = {
  shelf: BookShelf;
  scope: BookScope;
  ownership: BookOwnership;
  sort: BookSort;
  direction: SortDirection;
};

export type SeriesViewPreferences = {
  scope: SeriesScope;
  sort: SeriesSort;
  direction: SortDirection;
};

export const DEFAULT_LIBRARY_VIEW_PREFERENCES: LibraryViewPreferences = {
  shelf: "tbr",
  scope: "all",
  ownership: "all",
  sort: "createdAt",
  direction: "desc",
};

export const DEFAULT_SERIES_VIEW_PREFERENCES: SeriesViewPreferences = {
  scope: "all",
  sort: "name",
  direction: "asc",
};

const BOOK_SHELVES: BookShelf[] = ["tbr", "reading", "done", "all"];
const BOOK_SCOPES: BookScope[] = ["all", "standalone", "incomplete", "complete", "upcoming"];
const BOOK_OWNERSHIPS: BookOwnership[] = ["all", "owned", "unowned"];
const BOOK_SORTS: BookSort[] = ["createdAt", "title", "author", "series", "seriesPosition", "releaseDate"];
const SERIES_SCOPES: SeriesScope[] = ["all", "incomplete", "complete", "upcoming"];
const SERIES_SORTS: SeriesSort[] = ["name", "books", "nextRelease", "updatedAt"];
const DIRECTIONS: SortDirection[] = ["asc", "desc"];

function readStoredValue(key: string): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function accepted<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

export function readLibraryViewPreferences(): LibraryViewPreferences {
  const stored = readStoredValue(LIBRARY_VIEW_PREFERENCES_KEY);
  return {
    shelf: accepted(stored.shelf, BOOK_SHELVES, DEFAULT_LIBRARY_VIEW_PREFERENCES.shelf),
    scope: accepted(stored.scope, BOOK_SCOPES, DEFAULT_LIBRARY_VIEW_PREFERENCES.scope),
    ownership: accepted(stored.ownership, BOOK_OWNERSHIPS, DEFAULT_LIBRARY_VIEW_PREFERENCES.ownership),
    sort: accepted(stored.sort, BOOK_SORTS, DEFAULT_LIBRARY_VIEW_PREFERENCES.sort),
    direction: accepted(stored.direction, DIRECTIONS, DEFAULT_LIBRARY_VIEW_PREFERENCES.direction),
  };
}

export function readSeriesViewPreferences(): SeriesViewPreferences {
  const stored = readStoredValue(SERIES_VIEW_PREFERENCES_KEY);
  return {
    scope: accepted(stored.scope, SERIES_SCOPES, DEFAULT_SERIES_VIEW_PREFERENCES.scope),
    sort: accepted(stored.sort, SERIES_SORTS, DEFAULT_SERIES_VIEW_PREFERENCES.sort),
    direction: accepted(stored.direction, DIRECTIONS, DEFAULT_SERIES_VIEW_PREFERENCES.direction),
  };
}

export function writeLibraryViewPreferences(preferences: LibraryViewPreferences) {
  try {
    window.localStorage.setItem(LIBRARY_VIEW_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {}
}

export function writeSeriesViewPreferences(preferences: SeriesViewPreferences) {
  try {
    window.localStorage.setItem(SERIES_VIEW_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {}
}
