"use client";

import { useMemo, useState } from "react";
import { currentLocalDate } from "../../lib/library/model";
import { selectTagCounts, selectVisibleBooks } from "../../lib/library/selectors";
import type {
  Book,
  BookScope,
  BookSort,
  Series,
  SortDirection,
} from "../../lib/library/types";
import { coverTone, formatDate, initials } from "./view-utils";

export function LibraryView({
  books,
  series,
  loading,
  onAddBook,
  onEditBook,
  onRemoveBook,
  onOpenSeries,
}: {
  books: Book[];
  series: Series[];
  loading: boolean;
  onAddBook: () => void;
  onEditBook: (book: Book) => void;
  onRemoveBook: (book: Book) => void;
  onOpenSeries: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [scope, setScope] = useState<BookScope>("all");
  const [sort, setSort] = useState<BookSort>("createdAt");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const seriesMap = useMemo(() => new Map(series.map((item) => [item.id, item])), [series]);
  const allTags = useMemo(() => selectTagCounts(books), [books]);
  const visibleBooks = useMemo(
    () => selectVisibleBooks({
      books,
      series,
      query,
      activeTag,
      scope,
      sort,
      direction,
      today: currentLocalDate(),
    }),
    [activeTag, books, direction, query, scope, series, sort],
  );
  const incompleteCount = series.filter((item) => item.status === "incomplete").length;

  function clearFilters() {
    setQuery("");
    setScope("all");
    setActiveTag("All");
  }

  return (
    <section className="page" aria-labelledby="library-title">
      <div className="page-heading">
        <div><p className="eyebrow">On this device</p><h1 id="library-title">My TBR</h1></div>
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
            <select value={sort} onChange={(event) => setSort(event.target.value as BookSort)}>
              <option value="createdAt">Date added</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
              <option value="series">Series</option>
              <option value="seriesPosition">Series order</option>
              <option value="releaseDate">Release date</option>
            </select>
          </label>
          <button className="direction-button" type="button" onClick={() => setDirection((current) => current === "asc" ? "desc" : "asc")} aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}>
            <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span> {direction === "asc" ? "Asc" : "Desc"}
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
          <button className={scope === value ? "active" : ""} type="button" onClick={() => setScope(value)} aria-pressed={scope === value} key={value}>{label}</button>
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
            return (
              <article className="book-card" key={book.id}>
                <div className={`cover cover-tone-${coverTone(book.id)}`}>
                  {book.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.coverImage} alt={`Cover of ${book.title}`} />
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
                    {book.releaseDate && <time dateTime={book.releaseDate}>{book.releaseDate >= currentLocalDate() ? "Releases" : "Released"} {formatDate(book.releaseDate)}</time>}
                  </div>
                  {book.tags.length > 0 && (
                    <div className="book-tags" aria-label="Tropes and tags">
                      {book.tags.map((tag) => <button className={activeTag === tag ? "active" : ""} type="button" onClick={() => setActiveTag((current) => current === tag ? "All" : tag)} aria-pressed={activeTag === tag} key={tag}>{tag}</button>)}
                    </div>
                  )}
                  {book.reason && <div className="reason-note"><small>Why it made the list</small><p>{book.reason}</p></div>}
                  <button className="danger-link" type="button" onClick={() => onRemoveBook(book)}>Remove book</button>
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

