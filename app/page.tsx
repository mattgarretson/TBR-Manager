"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  deleteBookRecord,
  deleteSeriesRecord,
  mergeLibrary,
  readLibrary,
  readMeta,
  replaceLibrary,
  saveBook,
  saveSeries,
  writeMeta,
} from "./library-db";
import {
  cleanSeriesName,
  createBackup,
  nextSeriesRelease,
  normalizeTags,
  parseBackup,
  seriesNameKey,
  sortSeriesBooks,
} from "./library-model.mjs";
import type { LibrarySnapshot, LocalBook, LocalSeries, SeriesStatus } from "./library-types";

type ViewName = "library" | "series" | "settings";
type ThemeName = "bookshop" | "forest" | "ocean" | "lavender";
type BookScope = "all" | "standalone" | "incomplete" | "complete" | "upcoming";
type SeriesScope = "all" | "incomplete" | "complete" | "upcoming";
type SortDirection = "asc" | "desc";

type BookDraft = {
  title: string;
  author: string;
  reason: string;
  tags: string[];
  coverImage: string;
  seriesId: string;
  seriesPosition: string;
  releaseDate: string;
  newSeriesName: string;
  newSeriesStatus: SeriesStatus;
  newSeriesNextTitle: string;
  newSeriesNextDate: string;
};

type SeriesDraft = {
  name: string;
  status: SeriesStatus;
  nextReleaseTitle: string;
  nextReleaseDate: string;
  notes: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type LegacySeries = {
  id: string;
  name: string;
  status: SeriesStatus;
  nextReleaseDate: string;
};

type LegacyBook = {
  id: string;
  seriesId: string | null;
  title: string;
  author: string;
  reason: string;
  tags: string[];
  coverUrl: string;
  createdAt: string;
  updatedAt: string;
};

const NEW_SERIES_VALUE = "__new_series__";
const LEGACY_IMPORT_META = "legacy-hosted-import-v1";
const THEME_STORAGE_KEY = "plot-pile-theme";
const THEMES: { id: ThemeName; name: string; description: string; color: string }[] = [
  { id: "bookshop", name: "Bookshop", description: "Berry & paper", color: "#7c2942" },
  { id: "forest", name: "Forest", description: "Sage & moss", color: "#355d45" },
  { id: "ocean", name: "Ocean", description: "Teal & sea glass", color: "#1e6072" },
  { id: "lavender", name: "Lavender", description: "Plum & lilac", color: "#69406f" },
];

const emptyBookDraft: BookDraft = {
  title: "",
  author: "",
  reason: "",
  tags: [],
  coverImage: "",
  seriesId: "",
  seriesPosition: "",
  releaseDate: "",
  newSeriesName: "",
  newSeriesStatus: "incomplete",
  newSeriesNextTitle: "",
  newSeriesNextDate: "",
};

const emptySeriesDraft: SeriesDraft = {
  name: "",
  status: "incomplete",
  nextReleaseTitle: "",
  nextReleaseDate: "",
  notes: "",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function coverTone(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return hash % 6;
}

function compareText(left: string, right: string, direction: SortDirection) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * (direction === "asc" ? 1 : -1);
}

function compareOptional(left: string, right: string, direction: SortDirection) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return compareText(left, right, direction);
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that cover image."));
    reader.readAsDataURL(file);
  });
}

async function importLegacyLibrary() {
  if (await readMeta(LEGACY_IMPORT_META)) return 0;
  const libraryId = window.localStorage.getItem("plot-pile-library-id");
  if (!libraryId) {
    await writeMeta(LEGACY_IMPORT_META, "no-legacy-library");
    return 0;
  }

  const response = await fetch(`/api/books?libraryId=${encodeURIComponent(libraryId)}`);
  if (!response.ok) throw new Error("Your old shelf could not be copied yet. It will retry next time.");
  const payload = (await response.json()) as { books?: LegacyBook[]; series?: LegacySeries[] };
  const now = new Date().toISOString();
  const importedSeries: LocalSeries[] = (payload.series ?? []).map((item) => ({
    id: item.id,
    name: cleanSeriesName(item.name),
    nameKey: seriesNameKey(item.name),
    status: item.status === "complete" ? "complete" : "incomplete",
    nextReleaseTitle: "",
    nextReleaseDate: item.nextReleaseDate || "",
    notes: "",
    createdAt: now,
    updatedAt: now,
  }));
  const importedSeriesIds = new Set(importedSeries.map((item) => item.id));
  const importedBooks: LocalBook[] = (payload.books ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    author: item.author,
    reason: item.reason,
    tags: normalizeTags(item.tags),
    coverImage: item.coverUrl || "",
    seriesId: item.seriesId && importedSeriesIds.has(item.seriesId) ? item.seriesId : null,
    seriesPosition: "",
    releaseDate: "",
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
  }));
  await mergeLibrary({ books: importedBooks, series: importedSeries });
  await writeMeta(LEGACY_IMPORT_META, now);
  return importedBooks.length;
}

export default function Home() {
  const [books, setBooks] = useState<LocalBook[]>([]);
  const [series, setSeries] = useState<LocalSeries[]>([]);
  const [view, setView] = useState<ViewName>("library");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [bookScope, setBookScope] = useState<BookScope>("all");
  const [bookSort, setBookSort] = useState("createdAt");
  const [bookDirection, setBookDirection] = useState<SortDirection>("desc");
  const [seriesScope, setSeriesScope] = useState<SeriesScope>("all");
  const [seriesQuery, setSeriesQuery] = useState("");
  const [seriesSort, setSeriesSort] = useState("name");
  const [seriesDirection, setSeriesDirection] = useState<SortDirection>("asc");

  const [bookEditorOpen, setBookEditorOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [bookDraft, setBookDraft] = useState<BookDraft>(emptyBookDraft);
  const [tagInput, setTagInput] = useState("");
  const [bookDirty, setBookDirty] = useState(false);

  const [seriesEditorOpen, setSeriesEditorOpen] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [seriesDraft, setSeriesDraft] = useState<SeriesDraft>(emptySeriesDraft);
  const [seriesDirty, setSeriesDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window !== "undefined" && (
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    ),
  );
  const [isIos] = useState(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [canPersistStorage] = useState(() => typeof navigator !== "undefined" && Boolean(navigator.storage?.persist));
  const [theme, setTheme] = useState<ThemeName>(() => {
    if (typeof window === "undefined") return "bookshop";
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.some((item) => item.id === saved) ? saved as ThemeName : "bookshop";
  });

  async function refreshLibrary() {
    const snapshot = await readLibrary();
    setBooks(snapshot.books);
    setSeries(snapshot.series);
  }

  useEffect(() => {
    let active = true;
    async function start() {
      try {
        let imported = 0;
        try {
          imported = await importLegacyLibrary();
        } catch (caught) {
          if (active) setError(caught instanceof Error ? caught.message : "Your old shelf could not be copied yet.");
        }
        const snapshot = await readLibrary();
        if (!active) return;
        setBooks(snapshot.books);
        setSeries(snapshot.series);
        if (imported) setNotice(`Moved ${imported} ${imported === 1 ? "book" : "books"} onto this device`);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not open the on-device library.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void start();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    if (navigator.storage?.persisted) void navigator.storage.persisted().then(setStoragePersistent);

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      THEMES.find((item) => item.id === theme)?.color ?? "#7c2942",
    );
  }, [theme]);

  useEffect(() => {
    if (!bookEditorOpen && !seriesEditorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [bookEditorOpen, seriesEditorOpen]);

  const seriesMap = useMemo(() => new Map(series.map((item) => [item.id, item])), [series]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    books.forEach((book) => book.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  }, [books]);

  const visibleBooks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const currentDate = today();
    return books
      .filter((book) => {
        const linkedSeries = book.seriesId ? seriesMap.get(book.seriesId) : null;
        const scopeMatches =
          bookScope === "all" ||
          (bookScope === "standalone" && !linkedSeries) ||
          (bookScope === "complete" && linkedSeries?.status === "complete") ||
          (bookScope === "incomplete" && linkedSeries?.status === "incomplete") ||
          (bookScope === "upcoming" && Boolean(book.releaseDate && book.releaseDate >= currentDate));
        const tagMatches = activeTag === "All" || book.tags.includes(activeTag);
        const searchMatches =
          !needle ||
          [book.title, book.author, book.reason, linkedSeries?.name ?? "", book.seriesPosition, ...book.tags]
            .join(" ")
            .toLocaleLowerCase()
            .includes(needle);
        return scopeMatches && tagMatches && searchMatches;
      })
      .sort((left, right) => {
        const leftSeries = left.seriesId ? seriesMap.get(left.seriesId)?.name ?? "" : "";
        const rightSeries = right.seriesId ? seriesMap.get(right.seriesId)?.name ?? "" : "";
        if (bookSort === "title") return compareText(left.title, right.title, bookDirection);
        if (bookSort === "author") return compareText(left.author, right.author, bookDirection);
        if (bookSort === "series") return compareOptional(leftSeries, rightSeries, bookDirection);
        if (bookSort === "releaseDate") return compareOptional(left.releaseDate, right.releaseDate, bookDirection);
        if (bookSort === "seriesPosition") return compareOptional(left.seriesPosition, right.seriesPosition, bookDirection);
        return compareText(left.createdAt, right.createdAt, bookDirection);
      });
  }, [activeTag, bookDirection, bookScope, bookSort, books, query, seriesMap]);

  const allSeriesCards = useMemo(() => {
    const currentDate = today();
    return series
      .map((item) => {
        const linkedBooks = sortSeriesBooks(books.filter((book) => book.seriesId === item.id)) as LocalBook[];
        return { item, books: linkedBooks, next: nextSeriesRelease(item, linkedBooks, currentDate) };
      });
  }, [books, series]);

  const seriesCards = useMemo(() => {
    const needle = seriesQuery.trim().toLocaleLowerCase();
    return allSeriesCards
      .filter(({ item, books: linkedBooks, next }) => {
        const scopeMatches = seriesScope === "all" || item.status === seriesScope || (seriesScope === "upcoming" && Boolean(next));
        const searchMatches = !needle || [item.name, item.notes, ...linkedBooks.flatMap((book) => [book.title, book.author])].join(" ").toLocaleLowerCase().includes(needle);
        return scopeMatches && searchMatches;
      })
      .sort((left, right) => {
        if (seriesSort === "books") {
          const compared = (left.books.length - right.books.length) * (seriesDirection === "asc" ? 1 : -1);
          return compared || compareText(left.item.name, right.item.name, "asc");
        }
        if (seriesSort === "nextRelease") {
          return compareOptional(left.next?.date ?? "", right.next?.date ?? "", seriesDirection);
        }
        if (seriesSort === "updatedAt") return compareText(left.item.updatedAt, right.item.updatedAt, seriesDirection);
        return compareText(left.item.name, right.item.name, seriesDirection);
      });
  }, [allSeriesCards, seriesDirection, seriesQuery, seriesScope, seriesSort]);

  const incompleteCount = series.filter((item) => item.status === "incomplete").length;
  const upcomingCount = allSeriesCards.filter(({ next }) => Boolean(next)).length;

  function changeView(nextView: ViewName) {
    setView(nextView);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateBookDraft(patch: Partial<BookDraft>) {
    setBookDraft((current) => ({ ...current, ...patch }));
    setBookDirty(true);
  }

  function openNewBook(preselectedSeriesId = "") {
    setEditingBookId(null);
    setBookDraft({ ...emptyBookDraft, seriesId: preselectedSeriesId });
    setTagInput("");
    setBookDirty(false);
    setError("");
    setBookEditorOpen(true);
  }

  function openEditBook(book: LocalBook) {
    setEditingBookId(book.id);
    setBookDraft({
      ...emptyBookDraft,
      title: book.title,
      author: book.author,
      reason: book.reason,
      tags: book.tags,
      coverImage: book.coverImage,
      seriesId: book.seriesId ?? "",
      seriesPosition: book.seriesPosition,
      releaseDate: book.releaseDate,
    });
    setTagInput("");
    setBookDirty(false);
    setError("");
    setBookEditorOpen(true);
  }

  function closeBookEditor() {
    if (saving) return;
    if (bookDirty && !window.confirm("Discard the changes to this book?")) return;
    setBookEditorOpen(false);
  }

  function updateSeriesDraft(patch: Partial<SeriesDraft>) {
    setSeriesDraft((current) => ({ ...current, ...patch }));
    setSeriesDirty(true);
  }

  function openNewSeries() {
    setEditingSeriesId(null);
    setSeriesDraft(emptySeriesDraft);
    setSeriesDirty(false);
    setError("");
    setSeriesEditorOpen(true);
  }

  function openEditSeries(item: LocalSeries) {
    setEditingSeriesId(item.id);
    setSeriesDraft({
      name: item.name,
      status: item.status,
      nextReleaseTitle: item.nextReleaseTitle,
      nextReleaseDate: item.nextReleaseDate,
      notes: item.notes,
    });
    setSeriesDirty(false);
    setError("");
    setSeriesEditorOpen(true);
  }

  function closeSeriesEditor() {
    if (saving) return;
    if (seriesDirty && !window.confirm("Discard the changes to this series?")) return;
    setSeriesEditorOpen(false);
  }

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (bookEditorOpen) closeBookEditor();
      else if (seriesEditorOpen) closeSeriesEditor();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  });

  function addTags(value: string) {
    const incoming = normalizeTags(value.split(","));
    if (!incoming.length) return;
    updateBookDraft({ tags: normalizeTags([...bookDraft.tags, ...incoming]) });
    setTagInput("");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagInput);
    }
  }

  async function chooseCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]).has(file.type)) {
      setError("Use a JPG, PNG, WebP, or GIF cover image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Cover images must be smaller than 5 MB.");
      return;
    }
    try {
      updateBookDraft({ coverImage: await readImage(file) });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that cover image.");
    }
  }

  async function submitBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = bookDraft.title.trim();
    const author = bookDraft.author.trim();
    if (!title || !author) {
      setError("Add both a title and an author.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      let seriesId = bookDraft.seriesId || null;
      if (bookDraft.seriesId === NEW_SERIES_VALUE) {
        const name = cleanSeriesName(bookDraft.newSeriesName);
        if (!name) throw new Error("Give the new series a name.");
        if (series.some((item) => item.nameKey === seriesNameKey(name))) {
          throw new Error("That series already exists. Choose it from the series list instead.");
        }
        const newSeries: LocalSeries = {
          id: crypto.randomUUID(),
          name,
          nameKey: seriesNameKey(name),
          status: bookDraft.newSeriesStatus,
          nextReleaseTitle: bookDraft.newSeriesStatus === "incomplete" ? bookDraft.newSeriesNextTitle.trim() : "",
          nextReleaseDate: bookDraft.newSeriesStatus === "incomplete" ? bookDraft.newSeriesNextDate : "",
          notes: "",
          createdAt: now,
          updatedAt: now,
        };
        await saveSeries(newSeries);
        seriesId = newSeries.id;
      }

      const existing = editingBookId ? books.find((book) => book.id === editingBookId) : null;
      const book: LocalBook = {
        id: existing?.id ?? crypto.randomUUID(),
        title,
        author,
        reason: bookDraft.reason.trim(),
        tags: normalizeTags([...bookDraft.tags, ...tagInput.split(",")]),
        coverImage: bookDraft.coverImage.trim(),
        seriesId: seriesId === NEW_SERIES_VALUE ? null : seriesId,
        seriesPosition: seriesId ? bookDraft.seriesPosition.trim() : "",
        releaseDate: bookDraft.releaseDate,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await saveBook(book);
      await refreshLibrary();
      setBookDirty(false);
      setBookEditorOpen(false);
      setNotice(existing ? "Book updated" : "Added to your TBR");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this book.");
    } finally {
      setSaving(false);
    }
  }

  async function submitSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = cleanSeriesName(seriesDraft.name);
    if (!name) {
      setError("Give the series a name.");
      return;
    }
    if (series.some((item) => item.id !== editingSeriesId && item.nameKey === seriesNameKey(name))) {
      setError("A series with that name already exists.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const existing = editingSeriesId ? series.find((item) => item.id === editingSeriesId) : null;
      const item: LocalSeries = {
        id: existing?.id ?? crypto.randomUUID(),
        name,
        nameKey: seriesNameKey(name),
        status: seriesDraft.status,
        nextReleaseTitle: seriesDraft.status === "incomplete" ? seriesDraft.nextReleaseTitle.trim() : "",
        nextReleaseDate: seriesDraft.status === "incomplete" ? seriesDraft.nextReleaseDate : "",
        notes: seriesDraft.notes.trim(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await saveSeries(item);
      await refreshLibrary();
      setSeriesDirty(false);
      setSeriesEditorOpen(false);
      setNotice(existing ? "Series updated everywhere" : "Series created");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this series.");
    } finally {
      setSaving(false);
    }
  }

  async function removeBook(book: LocalBook) {
    if (!window.confirm(`Remove “${book.title}” from this device?`)) return;
    try {
      await deleteBookRecord(book.id);
      await refreshLibrary();
      setNotice("Book removed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this book.");
    }
  }

  async function removeSeries(item: LocalSeries) {
    const linkedCount = books.filter((book) => book.seriesId === item.id).length;
    const warning = linkedCount
      ? `Delete “${item.name}”? Its ${linkedCount} linked ${linkedCount === 1 ? "book" : "books"} will become standalone.`
      : `Delete “${item.name}”?`;
    if (!window.confirm(warning)) return;
    try {
      await deleteSeriesRecord(item.id);
      await refreshLibrary();
      setSeriesEditorOpen(false);
      setNotice("Series removed; books kept");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this series.");
    }
  }

  function exportBackup() {
    const backup = createBackup(books, series);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plot-pile-backup-${today()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Backup downloaded");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = parseBackup(JSON.parse(await file.text())) as LibrarySnapshot;
      if (!window.confirm(`Restore ${parsed.books.length} books and ${parsed.series.length} series? This replaces the library currently on this device.`)) return;
      await replaceLibrary(parsed);
      await refreshLibrary();
      changeView("library");
      setNotice("Backup restored");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That backup could not be restored.");
    }
  }

  async function eraseLibrary() {
    if (!window.confirm("Erase every book and series stored on this device? Download a backup first if you may want them later.")) return;
    await replaceLibrary({ books: [], series: [] });
    await refreshLibrary();
    changeView("library");
    setNotice("On-device library erased");
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setNotice("Plot Pile installed");
    setInstallPrompt(null);
  }

  async function protectStorage() {
    if (!navigator.storage?.persist) return;
    const persistent = await navigator.storage.persist();
    setStoragePersistent(persistent);
    setNotice(persistent ? "Browser storage protection enabled" : "The browser kept its normal storage policy");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => changeView("library")} aria-label="Open My TBR">
          <span className="brand-mark">PP</span>
          <span>Plot Pile</span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "library" ? "active" : ""} type="button" aria-current={view === "library" ? "page" : undefined} onClick={() => changeView("library")}>Library</button>
          <button className={view === "series" ? "active" : ""} type="button" aria-current={view === "series" ? "page" : undefined} onClick={() => changeView("series")}>Series</button>
          <button className={view === "settings" ? "active" : ""} type="button" aria-current={view === "settings" ? "page" : undefined} onClick={() => changeView("settings")}>More</button>
        </nav>
        <button className="primary-button desktop-add" type="button" onClick={() => openNewBook()}>
          <span aria-hidden="true">＋</span> Add book
        </button>
      </header>

      {error && !bookEditorOpen && !seriesEditorOpen && (
        <div className="global-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {view === "library" && (
        <section className="page" aria-labelledby="library-title">
          <div className="page-heading">
            <div>
              <p className="eyebrow">On this device</p>
              <h1 id="library-title">My TBR</h1>
            </div>
            <div className="mini-stats" aria-label="Library summary">
              <span><strong>{books.length}</strong> books</span>
              <span><strong>{series.length}</strong> series</span>
              <span><strong>{incompleteCount}</strong> waiting</span>
            </div>
          </div>

          <div className="library-tools">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Search books</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search books, authors, series, notes, or tropes" />
            </label>
            <div className="sort-tools" aria-label="Sort books">
              <label>
                <span className="sr-only">Sort books by</span>
                <select value={bookSort} onChange={(event) => setBookSort(event.target.value)}>
                  <option value="createdAt">Date added</option>
                  <option value="title">Title</option>
                  <option value="author">Author</option>
                  <option value="series">Series</option>
                  <option value="seriesPosition">Series order</option>
                  <option value="releaseDate">Release date</option>
                </select>
              </label>
              <button className="direction-button" type="button" onClick={() => setBookDirection((current) => current === "asc" ? "desc" : "asc")} aria-label={`Sort ${bookDirection === "asc" ? "descending" : "ascending"}`}>
                <span aria-hidden="true">{bookDirection === "asc" ? "↑" : "↓"}</span> {bookDirection === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
          </div>

          <div className="filter-row" aria-label="Filter books">
            {([
              ["all", "All"],
              ["standalone", "Standalone"],
              ["incomplete", "Incomplete series"],
              ["complete", "Complete series"],
              ["upcoming", "Upcoming releases"],
            ] as [BookScope, string][]).map(([value, label]) => (
              <button className={bookScope === value ? "active" : ""} type="button" onClick={() => setBookScope(value)} aria-pressed={bookScope === value} key={value}>{label}</button>
            ))}
          </div>

          {allTags.length > 0 && (
            <div className="tag-filter" aria-label="Filter by trope or tag">
              <button className={activeTag === "All" ? "active" : ""} type="button" onClick={() => setActiveTag("All")} aria-pressed={activeTag === "All"}>All tags <span>{books.length}</span></button>
              {allTags.map(([tag, count]) => (
                <button className={activeTag === tag ? "active" : ""} type="button" onClick={() => setActiveTag((current) => current === tag ? "All" : tag)} aria-pressed={activeTag === tag} key={tag}>{tag} <span>{count}</span></button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="card-grid loading-grid" aria-label="Loading your library"><i /><i /><i /></div>
          ) : visibleBooks.length ? (
            <div className="card-grid">
              {visibleBooks.map((book) => {
                const linkedSeries = book.seriesId ? seriesMap.get(book.seriesId) : null;
                return (
                  <article className="book-card" key={book.id}>
                    <div className={`cover cover-tone-${coverTone(book.id)}`}>
                      {book.coverImage ? (
                        // Covers can be device-local data URLs or user-provided image addresses.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={book.coverImage} alt={`Cover of ${book.title}`} />
                      ) : (
                        <div className="cover-placeholder"><span>{initials(book.title)}</span><small>{book.author}</small></div>
                      )}
                    </div>
                    <div className="book-content">
                      <div className="card-heading">
                        <div>
                          <h2>{book.title}</h2>
                          <p>by {book.author}</p>
                        </div>
                        <button className="text-action" type="button" onClick={() => openEditBook(book)}>Edit</button>
                      </div>
                      <div className="book-meta">
                        {linkedSeries ? (
                          <button className="series-link" type="button" onClick={() => { setSeriesScope("all"); setSeriesQuery(linkedSeries.name); changeView("series"); }}>
                            {linkedSeries.name}{book.seriesPosition ? ` · Book ${book.seriesPosition}` : ""}
                          </button>
                        ) : <span className="standalone-badge">Standalone</span>}
                        {linkedSeries && <span className={`status-badge ${linkedSeries.status}`}>{linkedSeries.status === "complete" ? "Complete" : "Incomplete"}</span>}
                        {book.releaseDate && <time dateTime={book.releaseDate}>{book.releaseDate >= today() ? "Releases" : "Released"} {formatDate(book.releaseDate)}</time>}
                      </div>
                      {book.tags.length > 0 && (
                        <div className="book-tags" aria-label="Tropes and tags">
                          {book.tags.map((tag) => <button className={activeTag === tag ? "active" : ""} type="button" onClick={() => setActiveTag((current) => current === tag ? "All" : tag)} aria-pressed={activeTag === tag} key={tag}>{tag}</button>)}
                        </div>
                      )}
                      {book.reason && <div className="reason-note"><small>Why it made the list</small><p>{book.reason}</p></div>}
                      <button className="danger-link" type="button" onClick={() => void removeBook(book)}>Remove book</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">＋</span>
              <p className="eyebrow">{books.length ? "No matches" : "Fresh shelf"}</p>
              <h2>{books.length ? "Nothing fits those filters." : "Start the pile."}</h2>
              <p>{books.length ? "Clear the search or choose another filter." : "Add the next recommendation before the reason you wanted it disappears."}</p>
              {books.length ? (
                <button className="secondary-button" type="button" onClick={() => { setQuery(""); setBookScope("all"); setActiveTag("All"); }}>Clear filters</button>
              ) : <button className="primary-button" type="button" onClick={() => openNewBook()}>＋ Add your first book</button>}
            </div>
          )}
        </section>
      )}

      {view === "series" && (
        <section className="page" aria-labelledby="series-title">
          <div className="page-heading">
            <div><p className="eyebrow">Keep the cliffhangers organized</p><h1 id="series-title">Series</h1></div>
            <button className="secondary-button heading-action" type="button" onClick={openNewSeries}>＋ New series</button>
          </div>
          <label className="search-field series-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search series and linked books</span>
            <input value={seriesQuery} onChange={(event) => setSeriesQuery(event.target.value)} type="search" placeholder="Search series or linked books" />
          </label>
          <div className="series-toolbar">
            <div className="filter-row" aria-label="Filter series">
              {([[
                "all", `All ${series.length}`
              ], ["incomplete", `Incomplete ${incompleteCount}`], ["complete", "Complete"], ["upcoming", `Upcoming ${upcomingCount}`]] as [SeriesScope, string][]).map(([value, label]) => (
                <button className={seriesScope === value ? "active" : ""} type="button" onClick={() => setSeriesScope(value)} aria-pressed={seriesScope === value} key={value}>{label}</button>
              ))}
            </div>
            <div className="sort-tools" aria-label="Sort series">
              <label><span className="sr-only">Sort series by</span><select value={seriesSort} onChange={(event) => setSeriesSort(event.target.value)}><option value="name">Series name</option><option value="books">Book count</option><option value="nextRelease">Next release</option><option value="updatedAt">Recently updated</option></select></label>
              <button className="direction-button" type="button" onClick={() => setSeriesDirection((current) => current === "asc" ? "desc" : "asc")} aria-label={`Sort ${seriesDirection === "asc" ? "descending" : "ascending"}`}><span aria-hidden="true">{seriesDirection === "asc" ? "↑" : "↓"}</span> {seriesDirection === "asc" ? "Asc" : "Desc"}</button>
            </div>
          </div>

          {seriesCards.length ? (
            <div className="series-list">
              {seriesCards.map(({ item, books: linkedBooks, next }) => (
                <article className="series-card" key={item.id}>
                  <div className="series-card-heading">
                    <div><span className={`status-badge ${item.status}`}>{item.status === "complete" ? "Complete series" : "Incomplete series"}</span><h2>{item.name}</h2><p>{linkedBooks.length} {linkedBooks.length === 1 ? "book" : "books"} linked</p></div>
                    <button className="text-action" type="button" onClick={() => openEditSeries(item)}>Edit series</button>
                  </div>
                  {next && <div className="release-callout"><span>Next release</span><strong>{next.title}</strong><time dateTime={next.date}>{formatDate(next.date)}</time></div>}
                  {item.notes && <p className="series-notes">{item.notes}</p>}
                  {linkedBooks.length ? (
                    <ol className="series-books">
                      {linkedBooks.map((book) => (
                        <li key={book.id}>
                          <button type="button" onClick={() => openEditBook(book)}>
                            <span className="book-order">{book.seriesPosition || "—"}</span>
                            <span><strong>{book.title}</strong><small>{book.author}{book.releaseDate ? ` · ${formatDate(book.releaseDate)}` : ""}</small></span>
                            <span aria-hidden="true">›</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="empty-series">No books linked yet.</p>}
                  <button className="add-to-series" type="button" onClick={() => openNewBook(item.id)}>＋ Add a book to this series</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state"><span className="empty-mark" aria-hidden="true">S</span><p className="eyebrow">Series shelf</p><h2>{series.length ? "No series match that filter." : "No series yet."}</h2><p>Create a series once, then link and order every book inside it.</p><button className="primary-button" type="button" onClick={openNewSeries}>＋ Create a series</button></div>
          )}
        </section>
      )}

      {view === "settings" && (
        <section className="page settings-page" aria-labelledby="settings-title">
          <div className="page-heading"><div><p className="eyebrow">Install, protect, and move it</p><h1 id="settings-title">More</h1></div></div>
          <div className="settings-grid">
            <article className="settings-card install-card">
              <span className="settings-icon" aria-hidden="true">⌂</span>
              <div><p className="eyebrow">Phone app</p><h2>{isInstalled ? "Installed" : "Install Plot Pile"}</h2>
                {isInstalled ? <p>It is running as a standalone app on this device.</p> : installPrompt ? <><p>Install it for a home-screen icon and offline access.</p><button className="primary-button" type="button" onClick={() => void installApp()}>Install app</button></> : isIos ? <p>In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p> : <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>}
              </div>
            </article>
            <article className="settings-card theme-card">
              <span className="settings-icon" aria-hidden="true">◐</span>
              <div><p className="eyebrow">Color scheme</p><h2>Make it hers</h2><p>Choose a palette. The selection stays on this device.</p>
                <div className="theme-options" role="group" aria-label="Choose a color scheme">
                  {THEMES.map((item) => (
                    <button className={theme === item.id ? "active" : ""} type="button" onClick={() => setTheme(item.id)} aria-pressed={theme === item.id} key={item.id}>
                      <span className={`theme-swatch ${item.id}`} aria-hidden="true"><i /><i /><i /></span>
                      <span><strong>{item.name}</strong><small>{item.description}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            </article>
            <article className="settings-card">
              <span className="settings-icon" aria-hidden="true">▣</span>
              <div><p className="eyebrow">On-device storage</p><h2>{books.length} books · {series.length} series</h2><p>Your library lives in this browser on this phone. It works offline and does not require an account.</p>
                {storagePersistent === true ? <span className="protected-label">✓ Storage protection enabled</span> : canPersistStorage && <button className="secondary-button" type="button" onClick={() => void protectStorage()}>Protect local storage</button>}
              </div>
            </article>
            <article className="settings-card">
              <span className="settings-icon" aria-hidden="true">⇩</span>
              <div><p className="eyebrow">Backup</p><h2>Download a copy</h2><p>The backup includes books, series, notes, tags, dates, and uploaded covers.</p><button className="secondary-button" type="button" onClick={exportBackup}>Download backup</button></div>
            </article>
            <article className="settings-card">
              <span className="settings-icon" aria-hidden="true">⇧</span>
              <div><p className="eyebrow">Restore or move</p><h2>Import a backup</h2><p>Use a backup to recover the library or move it to another phone or browser.</p><label className="secondary-button file-button">Choose backup<input type="file" accept="application/json,.json" onChange={(event) => void importBackup(event)} /></label></div>
            </article>
            <article className="settings-card danger-card">
              <span className="settings-icon" aria-hidden="true">!</span>
              <div><p className="eyebrow">Danger zone</p><h2>Erase this device</h2><p>This permanently removes the local library from this browser. It does not affect a backup file.</p><button className="danger-button" type="button" onClick={() => void eraseLibrary()}>Erase local library</button></div>
            </article>
          </div>
        </section>
      )}

      <button className="mobile-fab" type="button" onClick={() => openNewBook()} aria-label="Add a book">＋</button>

      {bookEditorOpen && (
        <div className="dialog-backdrop">
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="book-dialog-title">
            <div className="dialog-grabber" aria-hidden="true" />
            <div className="dialog-heading"><div><p className="eyebrow">{editingBookId ? "Update the details" : "Add to the pile"}</p><h2 id="book-dialog-title">{editingBookId ? "Edit book" : "New book"}</h2></div><button className="close-button" type="button" onClick={closeBookEditor} aria-label="Close">×</button></div>
            <form onSubmit={submitBook}>
              <div className="cover-editor">
                <label className={`cover-picker cover-tone-${coverTone((editingBookId ?? bookDraft.title) || "new")}`}>
                  {bookDraft.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bookDraft.coverImage} alt="Selected cover preview" />
                  ) : <span><b>＋</b>Add cover</span>}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void chooseCover(event)} />
                </label>
                <div><strong>Cover is optional</strong><p>Upload one for offline use, or paste an image address.</p><input className="standard-input" type="url" value={bookDraft.coverImage.startsWith("data:") ? "" : bookDraft.coverImage} disabled={bookDraft.coverImage.startsWith("data:")} onChange={(event) => updateBookDraft({ coverImage: event.target.value })} placeholder="https://…" />{bookDraft.coverImage && <button className="danger-link" type="button" onClick={() => updateBookDraft({ coverImage: "" })}>Remove cover</button>}</div>
              </div>

              <div className="field-row">
                <label className="form-field"><span>Book title</span><input autoFocus required value={bookDraft.title} onChange={(event) => updateBookDraft({ title: event.target.value })} /></label>
                <label className="form-field"><span>Author</span><input required value={bookDraft.author} onChange={(event) => updateBookDraft({ author: event.target.value })} /></label>
              </div>
              <div className="field-row">
                <label className="form-field"><span>Series</span><select value={bookDraft.seriesId} onChange={(event) => updateBookDraft({ seriesId: event.target.value })}><option value="">Standalone book</option>{[...series].sort((a, b) => a.name.localeCompare(b.name)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}<option value={NEW_SERIES_VALUE}>＋ Create a new series</option></select></label>
                <label className="form-field"><span>Book release date <small>Optional</small></span><input type="date" value={bookDraft.releaseDate} onChange={(event) => updateBookDraft({ releaseDate: event.target.value })} /></label>
              </div>
              {bookDraft.seriesId && bookDraft.seriesId !== NEW_SERIES_VALUE && <label className="form-field compact-field"><span>Position in series <small>Optional</small></span><input value={bookDraft.seriesPosition} onChange={(event) => updateBookDraft({ seriesPosition: event.target.value })} placeholder="1, 2, 2.5, novella…" /></label>}
              {bookDraft.seriesId === NEW_SERIES_VALUE && (
                <fieldset className="nested-fields"><legend>New series</legend><label className="form-field"><span>Series name</span><input value={bookDraft.newSeriesName} onChange={(event) => updateBookDraft({ newSeriesName: event.target.value })} /></label><div className="field-row"><label className="form-field"><span>Status</span><select value={bookDraft.newSeriesStatus} onChange={(event) => updateBookDraft({ newSeriesStatus: event.target.value as SeriesStatus, newSeriesNextTitle: event.target.value === "complete" ? "" : bookDraft.newSeriesNextTitle, newSeriesNextDate: event.target.value === "complete" ? "" : bookDraft.newSeriesNextDate })}><option value="incomplete">Incomplete</option><option value="complete">Complete</option></select></label>{bookDraft.newSeriesStatus === "incomplete" && <label className="form-field"><span>Next release date <small>Optional</small></span><input type="date" value={bookDraft.newSeriesNextDate} onChange={(event) => updateBookDraft({ newSeriesNextDate: event.target.value })} /></label>}</div>{bookDraft.newSeriesStatus === "incomplete" && <label className="form-field"><span>Next book title <small>Optional</small></span><input value={bookDraft.newSeriesNextTitle} onChange={(event) => updateBookDraft({ newSeriesNextTitle: event.target.value })} /></label>}</fieldset>
              )}
              <label className="form-field"><span>Why did you want to read it? <small>Optional</small></span><textarea value={bookDraft.reason} onChange={(event) => updateBookDraft({ reason: event.target.value })} rows={4} placeholder="What sold you on it?" /></label>
              <div className="form-field"><div className="label-row"><span>Tropes & tags</span><small>No limit</small></div><div className="tag-entry">{bookDraft.tags.map((tag) => <button type="button" onClick={() => updateBookDraft({ tags: bookDraft.tags.filter((item) => item !== tag) })} aria-label={`Remove ${tag}`} key={tag}>{tag} <span>×</span></button>)}<input value={tagInput} onChange={(event) => { setTagInput(event.target.value); setBookDirty(true); }} onKeyDown={handleTagKeyDown} onBlur={() => addTags(tagInput)} placeholder={bookDraft.tags.length ? "Add another…" : "slow burn, found family…"} /></div><small className="field-hint">Press enter or use commas between tags.</small></div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="dialog-actions"><button className="cancel-button" type="button" onClick={closeBookEditor}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : editingBookId ? "Save changes" : "Add to my TBR"}</button></div>
            </form>
          </section>
        </div>
      )}

      {seriesEditorOpen && (
        <div className="dialog-backdrop">
          <section className="dialog series-dialog" role="dialog" aria-modal="true" aria-labelledby="series-dialog-title">
            <div className="dialog-grabber" aria-hidden="true" />
            <div className="dialog-heading"><div><p className="eyebrow">One source of truth</p><h2 id="series-dialog-title">{editingSeriesId ? "Edit series" : "New series"}</h2></div><button className="close-button" type="button" onClick={closeSeriesEditor} aria-label="Close">×</button></div>
            <form onSubmit={submitSeries}>
              <label className="form-field"><span>Series name</span><input autoFocus required value={seriesDraft.name} onChange={(event) => updateSeriesDraft({ name: event.target.value })} /></label>
              <label className="form-field"><span>Series status</span><select value={seriesDraft.status} onChange={(event) => updateSeriesDraft({ status: event.target.value as SeriesStatus, nextReleaseTitle: event.target.value === "complete" ? "" : seriesDraft.nextReleaseTitle, nextReleaseDate: event.target.value === "complete" ? "" : seriesDraft.nextReleaseDate })}><option value="incomplete">Incomplete</option><option value="complete">Complete</option></select></label>
              {seriesDraft.status === "incomplete" && <div className="field-row"><label className="form-field"><span>Next book title <small>Optional</small></span><input value={seriesDraft.nextReleaseTitle} onChange={(event) => updateSeriesDraft({ nextReleaseTitle: event.target.value })} /></label><label className="form-field"><span>Next release date <small>Optional</small></span><input type="date" value={seriesDraft.nextReleaseDate} onChange={(event) => updateSeriesDraft({ nextReleaseDate: event.target.value })} /></label></div>}
              <label className="form-field"><span>Series notes <small>Optional</small></span><textarea value={seriesDraft.notes} onChange={(event) => updateSeriesDraft({ notes: event.target.value })} rows={4} placeholder="Reading order, spin-offs, or anything else worth remembering…" /></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="dialog-actions series-actions">{editingSeriesId && <button className="danger-button" type="button" onClick={() => { const item = series.find((candidate) => candidate.id === editingSeriesId); if (item) void removeSeries(item); }}>Delete series</button>}<span /><button className="cancel-button" type="button" onClick={closeSeriesEditor}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save series"}</button></div>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">✓ {notice}</div>}
    </main>
  );
}
