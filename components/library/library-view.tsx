import { useEffect, useMemo, useState } from "react";
import { currentLocalDate, effectiveBookTags } from "../../lib/library/model";
import { selectTagCounts, selectVisibleBooks } from "../../lib/library/selectors";
import type {
  Book,
  BookOwnership,
  BookScope,
  BookShelf,
  BookSort,
  BookStatus,
  Series,
} from "../../lib/library/types";
import { coverTone, formatDate, initials } from "./view-utils";
import {
  DEFAULT_LIBRARY_VIEW_PREFERENCES,
  readLibraryViewPreferences,
  writeLibraryViewPreferences,
} from "./view-preferences";

export function LibraryView({
  books,
  series,
  loading,
  saving,
  onAddBook,
  onEditBook,
  onChangeBookStatus,
  onToggleOwned,
  onRemoveBook,
  onOpenSeries,
  showBackupNudge,
  onOpenSettings,
  onDismissBackupNudge,
}: {
  books: Book[];
  series: Series[];
  loading: boolean;
  saving: boolean;
  onAddBook: () => void;
  onEditBook: (book: Book) => void;
  onChangeBookStatus: (book: Book, status: BookStatus) => void;
  onToggleOwned: (book: Book) => void;
  onRemoveBook: (book: Book) => void;
  onOpenSeries: (name: string) => void;
  showBackupNudge: boolean;
  onOpenSettings: () => void;
  onDismissBackupNudge: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [preferences, setPreferences] = useState(readLibraryViewPreferences);
  const { shelf, scope, ownership, sort, direction } = preferences;
  const seriesMap = useMemo(() => new Map(series.map((item) => [item.id, item])), [series]);
  const allTags = useMemo(() => selectTagCounts(books, series), [books, series]);
  const visibleBooks = useMemo(
    () => selectVisibleBooks({
      books,
      series,
      query,
      activeTag,
      shelf,
      scope,
      ownership,
      sort,
      direction,
      today: currentLocalDate(),
    }),
    [activeTag, books, direction, ownership, query, scope, series, shelf, sort],
  );
  const incompleteCount = series.filter((item) => item.status === "incomplete").length;
  const unfinishedCount = books.filter((item) => item.status === "tbr" || item.status === "reading").length;
  const doneCount = books.filter((item) => item.status === "finished" || item.status === "dnf").length;

  useEffect(() => {
    writeLibraryViewPreferences(preferences);
  }, [preferences]);

  function clearFilters() {
    setQuery("");
    setActiveTag("All");
    setPreferences(DEFAULT_LIBRARY_VIEW_PREFERENCES);
  }

  return (
    <section className="page" aria-labelledby="library-title">
      <div className="page-heading">
        <div><p className="eyebrow">On this device</p><h1 id="library-title">My TBR</h1></div>
        <div className="mini-stats" aria-label="Library summary">
          <span><strong>{unfinishedCount}</strong> books</span>
          <span><strong>{doneCount}</strong> done</span>
          <span><strong>{series.length}</strong> series</span>
          <span><strong>{incompleteCount}</strong> waiting</span>
        </div>
      </div>

      {showBackupNudge && (
        <aside className="backup-nudge" aria-label="Backup reminder">
          <button type="button" onClick={onOpenSettings}>
            <strong>It’s been a while since your last backup</strong>
            <span>Open More to download a fresh copy.</span>
          </button>
          <button className="backup-nudge-dismiss" type="button" onClick={onDismissBackupNudge} aria-label="Dismiss backup reminder">×</button>
        </aside>
      )}

      <div className="library-tools">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search books</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search books, authors, series, notes, or tropes" />
        </label>
        <div className="sort-tools" aria-label="Sort books">
          <label>
            <span className="sr-only">Sort books by</span>
            <select value={sort} onChange={(event) => setPreferences((current) => ({ ...current, sort: event.target.value as BookSort }))}>
              <option value="createdAt">Date added</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
              <option value="series">Series</option>
              <option value="seriesPosition">Series order</option>
              <option value="releaseDate">Release date</option>
            </select>
          </label>
          <button className="direction-button" type="button" onClick={() => setPreferences((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))} aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}>
            <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span> {direction === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
      </div>

      <div className="shelf-filter" aria-label="Choose a reading shelf">
        {([
          ["tbr", "To read"],
          ["reading", "Reading"],
          ["done", "Done"],
          ["all", "All"],
        ] as [BookShelf, string][]).map(([value, label]) => (
          <button className={shelf === value ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, shelf: value }))} aria-pressed={shelf === value} key={value}>{label}</button>
        ))}
      </div>

      <div className="filter-row" aria-label="Filter books">
        {([
          ["all", "All"],
          ["standalone", "Standalone"],
          ["incomplete", "Ongoing series"],
          ["complete", "Finished series"],
          ["upcoming", "Upcoming releases"],
        ] as [BookScope, string][]).map(([value, label]) => (
          <button className={scope === value ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, scope: value }))} aria-pressed={scope === value} key={value}>{label}</button>
        ))}
        <span className="filter-divider" aria-hidden="true" />
        {([
          ["owned", "Owned"],
          ["unowned", "To buy"],
        ] as [Exclude<BookOwnership, "all">, string][]).map(([value, label]) => (
          <button className={ownership === value ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, ownership: current.ownership === value ? "all" : value }))} aria-pressed={ownership === value} key={value}>{label}</button>
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
            const linkedSeries = book.seriesId ? seriesMap.get(book.seriesId) : undefined;
            const visibleTags = effectiveBookTags(book, linkedSeries);
            return (
              <article className="book-card" key={book.id}>
                <div className={`cover cover-tone-${coverTone(book.id)}`}>
                  {book.coverImage ? (
                    <img src={book.coverImage} alt={`Cover of ${book.title}`} loading="lazy" decoding="async" />
                  ) : (
                    <div className="cover-placeholder"><span>{initials(book.title)}</span><small>{book.author}</small></div>
                  )}
                </div>
                <div className="book-content">
                  <div className="card-heading">
                    <div><h2>{book.title}</h2><p>by {book.author}</p></div>
                    <button className="text-action" type="button" onClick={() => onEditBook(book)}>Edit</button>
                  </div>
                  <div className="book-meta">
                    {linkedSeries ? (
                      <button className="series-link" type="button" onClick={() => onOpenSeries(linkedSeries.name)}>
                        {linkedSeries.name}{book.seriesPosition ? ` · Book ${book.seriesPosition}` : ""}
                      </button>
                    ) : <span className="standalone-badge">Standalone</span>}
                    {linkedSeries && <span className={`status-badge ${linkedSeries.status}`}>{linkedSeries.status === "complete" ? "Complete" : "Incomplete"}</span>}
                    {book.status !== "tbr" && (
                      <span className={`status-badge book-status-badge ${book.status}`}>
                        {book.status === "reading" ? "Reading" : book.status === "finished" ? "Finished" : "Didn't finish"}
                      </span>
                    )}
                    <button className={`ownership-toggle${book.owned ? " owned" : ""}`} type="button" disabled={saving} onClick={() => onToggleOwned(book)} aria-pressed={book.owned} aria-label={book.owned ? `${book.title} is owned. Mark as still to buy` : `${book.title} is still to buy. Mark as owned`}>
                      {book.owned ? "✓ Owned" : "To buy"}
                    </button>
                    {book.releaseDate && <time dateTime={book.releaseDate}>{book.releaseDate >= currentLocalDate() ? "Releases" : "Released"} {formatDate(book.releaseDate)}</time>}
                    {book.sourceUrl && <a className="source-link" href={book.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open where ${book.title} was found`}>Source ↗</a>}
                  </div>
                  {visibleTags.length > 0 && (
                    <div className="book-tags" aria-label="Tropes and tags">
                      {visibleTags.map((tag) => <button className={`${activeTag === tag ? "active" : ""}${linkedSeries?.tags.includes(tag) ? " inherited" : ""}`} title={linkedSeries?.tags.includes(tag) ? `Inherited from ${linkedSeries.name}` : undefined} type="button" onClick={() => setActiveTag((current) => current === tag ? "All" : tag)} aria-pressed={activeTag === tag} key={tag}>{tag}</button>)}
                    </div>
                  )}
                  {book.reason && <div className="reason-note"><small>Why it made the list</small><p>{book.reason}</p></div>}
                  <div className="book-card-footer">
                    {book.status === "tbr" && (
                      <div className="book-status-actions">
                        <button className="book-transition-button start" type="button" disabled={saving} onClick={() => onChangeBookStatus(book, "reading")}>Start reading</button>
                      </div>
                    )}
                    {book.status === "reading" && (
                      <div className="book-status-actions">
                        <button className="book-transition-button finish" type="button" disabled={saving} onClick={() => onChangeBookStatus(book, "finished")}>Finished</button>
                        <button className="book-transition-button dnf" type="button" disabled={saving} onClick={() => onChangeBookStatus(book, "dnf")}>Didn&apos;t finish</button>
                      </div>
                    )}
                    <button className="danger-link" type="button" onClick={() => onRemoveBook(book)}>Remove book</button>
                  </div>
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
          {books.length ? <button className="secondary-button" type="button" onClick={clearFilters}>Clear filters</button> : <button className="primary-button" type="button" onClick={onAddBook}>＋ Add your first book</button>}
        </div>
      )}
    </section>
  );
}
