import { useEffect, useMemo, useState } from "react";
import { currentLocalDate } from "../../lib/library/model";
import { selectAllSeriesCards, selectSeriesCards } from "../../lib/library/selectors";
import type { Book, Series, SeriesScope, SeriesSort } from "../../lib/library/types";
import { formatDate } from "./view-utils";
import {
  readSeriesViewPreferences,
  writeSeriesViewPreferences,
} from "./view-preferences";

export function SeriesView({
  books,
  series,
  focusName,
  onAddSeries,
  onEditSeries,
  onAddBook,
  onEditBook,
}: {
  books: Book[];
  series: Series[];
  focusName: string;
  onAddSeries: () => void;
  onEditSeries: (series: Series) => void;
  onAddBook: (seriesId: string) => void;
  onEditBook: (book: Book) => void;
}) {
  const [preferences, setPreferences] = useState(readSeriesViewPreferences);
  const { scope, sort, direction } = preferences;
  const [query, setQuery] = useState(focusName);
  const allCards = useMemo(() => selectAllSeriesCards(series, books, currentLocalDate()), [books, series]);
  const cards = useMemo(
    () => selectSeriesCards({ cards: allCards, query, scope, sort, direction }),
    [allCards, direction, query, scope, sort],
  );
  const incompleteCount = series.filter((item) => item.status === "incomplete").length;
  const completeCount = series.length - incompleteCount;
  const upcomingCount = allCards.filter(({ next }) => Boolean(next)).length;

  useEffect(() => {
    writeSeriesViewPreferences(preferences);
  }, [preferences]);

  return (
    <section className="page" aria-labelledby="series-title">
      <div className="page-heading">
        <div><p className="eyebrow">Keep the cliffhangers organized</p><h1 id="series-title">Series</h1></div>
        <button className="secondary-button heading-action" type="button" onClick={onAddSeries} aria-label="New series">＋ New series</button>
      </div>
      <label className="search-field series-search">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Search series and linked books</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search series or linked books" />
      </label>
      <div className="series-toolbar">
        <div className="filter-row" aria-label="Filter series">
          {([
            ["all", `All ${series.length}`],
            ["incomplete", `Ongoing ${incompleteCount}`],
            ["complete", `Finished ${completeCount}`],
            ["upcoming", `Upcoming ${upcomingCount}`],
          ] as [SeriesScope, string][]).map(([value, label]) => (
            <button className={scope === value ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, scope: value }))} aria-pressed={scope === value} key={value}>{label}</button>
          ))}
        </div>
        <div className="sort-tools" aria-label="Sort series">
          <label><span className="sr-only">Sort series by</span><select value={sort} onChange={(event) => setPreferences((current) => ({ ...current, sort: event.target.value as SeriesSort }))}><option value="name">Series name</option><option value="books">Book count</option><option value="nextRelease">Next release</option><option value="updatedAt">Recently updated</option></select></label>
          <button className="direction-button" type="button" onClick={() => setPreferences((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))} aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}><span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span> {direction === "asc" ? "Asc" : "Desc"}</button>
        </div>
      </div>

      {cards.length ? (
        <div className="series-list">
          {cards.map(({ item, books: linkedBooks, next }) => (
            <article className="series-card" key={item.id}>
              <div className="series-card-heading">
                <div><span className={`status-badge ${item.status}`}>{item.status === "complete" ? "Finished publishing" : "Ongoing series"}</span><h2>{item.name}</h2>{item.author && <p>by {item.author}</p>}<p>{linkedBooks.length} {linkedBooks.length === 1 ? "book" : "books"} linked</p></div>
                <button className="text-action" type="button" onClick={() => onEditSeries(item)}>Edit series</button>
              </div>
              {next && <div className="release-callout"><span>Next release</span><strong>{next.title}</strong><time dateTime={next.date}>{formatDate(next.date)}</time></div>}
              {item.tags.length > 0 && <div className="series-tags" aria-label="Series tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
              {item.notes && <p className="series-notes">{item.notes}</p>}
              {linkedBooks.length ? (
                <ol className="series-books">
                  {linkedBooks.map((book) => (
                    <li key={book.id}>
                      <button type="button" onClick={() => onEditBook(book)}>
                        <span className="book-order">{book.seriesPosition || "—"}</span>
                        <span><strong>{book.title}</strong><small>{book.author}{book.releaseDate ? ` · ${formatDate(book.releaseDate)}` : ""}</small></span>
                        <span className="series-book-trailing">
                          {book.status === "reading" && <span className="series-book-status reading">Reading</span>}
                          {book.status === "finished" && <span className="series-book-status finished" aria-label="Finished"><span aria-hidden="true">✓</span></span>}
                          {book.status === "dnf" && <span className="series-book-status dnf">DNF</span>}
                          <span aria-hidden="true">›</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p className="empty-series">No books linked yet.</p>}
              {item.status === "incomplete" && <button className="add-to-series" type="button" onClick={() => onAddBook(item.id)} aria-label={linkedBooks.length ? "Add next book" : "Add first book"}>＋ {linkedBooks.length ? "Add next book" : "Add first book"}</button>}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><span className="empty-mark" aria-hidden="true">S</span><p className="eyebrow">Series shelf</p><h2>{series.length ? "No series match that filter." : "No series yet."}</h2><p>Create a series once, then link and order every book inside it.</p><button className="primary-button" type="button" onClick={onAddSeries}>＋ Create a series</button></div>
      )}
    </section>
  );
}
