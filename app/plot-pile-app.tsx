import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { BookEditor } from "../components/library/book-editor";
import type { CoverSearchClient } from "../components/library/cover-search";
import { LibraryView } from "../components/library/library-view";
import { LinkImport } from "../components/library/link-import";
import { SeriesEditor } from "../components/library/series-editor";
import { SeriesView } from "../components/library/series-view";
import { SettingsView } from "../components/library/settings-view";
import type { Book, BookStatus, Series, ViewName } from "../lib/library/types";
import { selectStoredTagCounts } from "../lib/library/selectors";
import { extractUrls, parseSharedBook, type SharedBookDraft } from "../lib/share/parse";
import { useDeviceSettings } from "./use-device-settings";
import { useLibraryController, type LibraryControllerDependencies } from "./use-library-controller";

type BookEditorState = { book?: Book; preselectedSeriesId?: string; prefill?: SharedBookDraft };
type SeriesEditorState = { series?: Series };
type LinkImportState = { initialText?: string };
type SharedLaunch =
  | { kind: "book"; draft: SharedBookDraft }
  | { kind: "links"; initialText: string };

function sharedLaunchFromLocation(): SharedLaunch | null {
  if (typeof window === "undefined") return null;
  const location = new URL(window.location.href);
  if (!["title", "text", "url"].some((key) => location.searchParams.has(key))) return null;
  const payload = {
    title: location.searchParams.get("title"),
    text: location.searchParams.get("text"),
    url: location.searchParams.get("url"),
  };
  const initialText = [payload.title, payload.text, payload.url].filter(Boolean).join("\n");
  return extractUrls(initialText).length > 1
    ? { kind: "links", initialText }
    : { kind: "book", draft: parseSharedBook(payload) };
}

export function PlotPileApp({
  controllerDependencies = {},
  coverClient,
}: {
  controllerDependencies?: LibraryControllerDependencies;
  coverClient?: CoverSearchClient;
}) {
  const library = useLibraryController(controllerDependencies);
  const device = useDeviceSettings(library.showNotice);
  const { books, series } = library.snapshot;
  const tagSuggestions = useMemo(
    () => selectStoredTagCounts(books, series).map(([tag]) => tag),
    [books, series],
  );
  const [view, setView] = useState<ViewName>("library");
  const [seriesFocus, setSeriesFocus] = useState("");
  const [bookEditor, setBookEditor] = useState<BookEditorState | null>(null);
  const [seriesEditor, setSeriesEditor] = useState<SeriesEditorState | null>(null);
  const [linkImport, setLinkImport] = useState<LinkImportState | null>(null);
  const [pendingShare, setPendingShare] = useState<SharedLaunch | null>(sharedLaunchFromLocation);

  useEffect(() => {
    if (!pendingShare) return;
    const location = new URL(window.location.href);
    location.searchParams.delete("title");
    location.searchParams.delete("text");
    location.searchParams.delete("url");
    window.history.replaceState(
      window.history.state,
      "",
      `${location.pathname}${location.search}${location.hash}`,
    );
  }, [pendingShare]);

  const activeBookEditor = bookEditor ?? (!library.loading && pendingShare?.kind === "book"
    ? { prefill: pendingShare.draft }
    : null);
  const activeLinkImport = linkImport ?? (!library.loading && pendingShare?.kind === "links"
    ? { initialText: pendingShare.initialText }
    : null);

  function changeView(nextView: ViewName) {
    setView(nextView);
    if (nextView !== "series") setSeriesFocus("");
    library.dismissError();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openNewBook(preselectedSeriesId = "") {
    library.dismissError();
    setBookEditor({ preselectedSeriesId });
  }

  function openEditBook(book: Book) {
    library.dismissError();
    setBookEditor({ book });
  }

  function openLinkImport() {
    library.dismissError();
    setLinkImport({});
  }

  function openNewSeries() {
    library.dismissError();
    setSeriesEditor({});
  }

  function openEditSeries(item: Series) {
    library.dismissError();
    setSeriesEditor({ series: item });
  }

  async function removeBook(book: Book) {
    try {
      await library.deleteBook(book.id);
    } catch {}
  }

  async function changeBookStatus(book: Book, status: BookStatus) {
    try {
      await library.saveBook({ ...book, status });
    } catch {}
  }

  async function removeSeries(item: Series, linkedCount: number) {
    const warning = linkedCount
      ? `Delete “${item.name}”? Its ${linkedCount} linked ${linkedCount === 1 ? "book" : "books"} will become standalone.`
      : `Delete “${item.name}”?`;
    if (!window.confirm(warning)) return;
    try {
      await library.deleteSeries(item.id);
      setSeriesEditor(null);
    } catch {}
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const value = JSON.parse(await file.text()) as { books?: unknown[]; series?: unknown[] };
      const bookCount = Array.isArray(value.books) ? value.books.length : 0;
      const seriesCount = Array.isArray(value.series) ? value.series.length : 0;
      if (!window.confirm(`Restore ${bookCount} books and ${seriesCount} series? This replaces the library currently on this device.`)) return;
      await library.restoreBackup(value);
      changeView("library");
    } catch (caught) {
      library.setError(caught instanceof Error ? caught.message : "That backup could not be restored.");
    }
  }

  async function shrinkCovers() {
    const count = books.filter((book) => book.coverImage.startsWith("data:")).length;
    if (!window.confirm(`Shrink ${count} stored ${count === 1 ? "cover" : "covers"} to at most 600×900? This can't be undone, so download a backup first if you want the originals.`)) return;
    try {
      await library.shrinkCovers();
    } catch {}
  }

  async function eraseLibrary() {
    if (!window.confirm("Erase every book and series stored on this device? Download a backup first if you may want them later.")) return;
    try {
      await library.erase();
      changeView("library");
    } catch {}
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
        <div className="desktop-add-actions">
          <button className="secondary-button" type="button" onClick={openLinkImport}>Add from links</button>
          <button className="primary-button" type="button" onClick={() => openNewBook()}><span aria-hidden="true">＋</span> Add book</button>
        </div>
      </header>

      {library.error && !activeBookEditor && !activeLinkImport && !seriesEditor && (
        <div className="global-error" role="alert"><span>{library.error}</span><button type="button" onClick={library.dismissError}>Dismiss</button></div>
      )}

      {view === "library" && (
        <LibraryView
          books={books}
          series={series}
          loading={library.loading}
          saving={library.saving}
          onAddBook={() => openNewBook()}
          onEditBook={openEditBook}
          onChangeBookStatus={(book, status) => void changeBookStatus(book, status)}
          onRemoveBook={(book) => void removeBook(book)}
          onOpenSeries={(name) => {
            setSeriesFocus(name);
            changeView("series");
          }}
          showBackupNudge={library.showBackupNudge}
          onOpenSettings={() => changeView("settings")}
          onDismissBackupNudge={() => void library.dismissBackupNudge()}
        />
      )}
      {view === "series" && (
        <SeriesView
          books={books}
          series={series}
          focusName={seriesFocus}
          onAddSeries={openNewSeries}
          onEditSeries={openEditSeries}
          onAddBook={openNewBook}
          onEditBook={openEditBook}
        />
      )}
      {view === "settings" && (
        <SettingsView
          books={books}
          series={series}
          saving={library.saving}
          lastBackupAt={library.lastBackupAt}
          device={device}
          onDownload={() => void library.downloadBackup()}
          onAddFromLinks={openLinkImport}
          onImport={(event) => void importBackup(event)}
          onShrinkCovers={() => void shrinkCovers()}
          onErase={() => void eraseLibrary()}
          onRenameTag={library.renameTag}
          onDeleteTag={library.deleteTag}
        />
      )}

      <button className="mobile-fab" type="button" onClick={() => openNewBook()} aria-label="Add a book">＋</button>

      {activeBookEditor && (
        <BookEditor
          key={activeBookEditor.book?.id ?? activeBookEditor.prefill?.sourceUrl ?? `new-${activeBookEditor.preselectedSeriesId ?? "standalone"}`}
          book={activeBookEditor.book}
          preselectedSeriesId={activeBookEditor.preselectedSeriesId}
          prefill={activeBookEditor.prefill}
          books={books}
          series={series}
          saving={library.saving}
          error={library.error}
          setError={library.setError}
          clearError={library.dismissError}
          coverClient={coverClient}
          tagSuggestions={tagSuggestions}
          onSave={library.saveBook}
          onClose={() => {
            setBookEditor(null);
            setPendingShare(null);
          }}
        />
      )}
      {activeLinkImport && (
        <LinkImport
          key={activeLinkImport.initialText ?? "manual"}
          initialText={activeLinkImport.initialText}
          books={books}
          saving={library.saving}
          error={library.error}
          setError={library.setError}
          clearError={library.dismissError}
          onSave={library.saveBooks}
          onClose={() => {
            setLinkImport(null);
            setPendingShare(null);
          }}
        />
      )}
      {seriesEditor && (
        <SeriesEditor
          key={seriesEditor.series?.id ?? "new"}
          series={seriesEditor.series}
          linkedBookCount={seriesEditor.series ? books.filter((book) => book.seriesId === seriesEditor.series?.id).length : 0}
          saving={library.saving}
          error={library.error}
          setError={library.setError}
          clearError={library.dismissError}
          tagSuggestions={tagSuggestions}
          onSave={library.saveSeries}
          onDelete={removeSeries}
          onClose={() => setSeriesEditor(null)}
        />
      )}

      {library.pendingBookRemovals.length ? (
        <div className="toast undo-toast" role="status">
          <span>{library.pendingBookRemovals.length === 1
            ? `Removed “${library.pendingBookRemovals[0].title}”`
            : `Removed ${library.pendingBookRemovals.length} books`}</span>
          <button type="button" disabled={library.saving} onClick={() => void library.undoBookRemoval()}>Undo</button>
        </div>
      ) : library.notice && <div className="toast" role="status">✓ {library.notice}</div>}
    </main>
  );
}
