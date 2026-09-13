import { useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  findDuplicateBook,
  MAX_COVER_DATA_URL_LENGTH,
  nextSeriesPosition,
  normalizeTags,
  seriesNameKey,
} from "../../lib/library/model";
import type {
  Book,
  BookStatus,
  LibrarySnapshot,
  SaveBookInput,
  Series,
  SeriesStatus,
} from "../../lib/library/types";
import type { SharedBookDraft } from "../../lib/share/parse";
import { DialogShell } from "./dialog-shell";
import { CoverSearch, type CoverSearchClient } from "./cover-search";
import { TagSuggestions } from "./tag-suggestions";
import { coverTone, readCoverImage, shrinkCoverDataUrl } from "./view-utils";

const NEW_SERIES_VALUE = "__new_series__";
// Photos are downscaled before they are stored, so the upload limit can exceed the stored-cover limit.
const MAX_COVER_UPLOAD_BYTES = 20 * 1024 * 1024;

type BookDraft = {
  title: string;
  author: string;
  reason: string;
  tags: string[];
  coverImage: string;
  seriesId: string;
  seriesPosition: string;
  releaseDate: string;
  status: BookStatus;
  finishedDate: string;
  sourceUrl: string;
  newSeriesName: string;
  newSeriesStatus: SeriesStatus;
  newSeriesNextTitle: string;
  newSeriesNextDate: string;
};

function initialDraft(
  book: Book | undefined,
  preselectedSeriesId: string,
  prefill: SharedBookDraft | undefined,
  series: readonly Series[],
  books: readonly Book[],
): BookDraft {
  const selectedSeries = series.find((item) => item.id === preselectedSeriesId);
  return {
    title: book?.title ?? prefill?.title ?? "",
    author: book?.author ?? prefill?.author ?? selectedSeries?.author ?? "",
    reason: book?.reason ?? "",
    tags: book?.tags ?? [],
    coverImage: book?.coverImage ?? "",
    seriesId: book?.seriesId ?? preselectedSeriesId,
    seriesPosition: book?.seriesPosition ?? (selectedSeries ? nextSeriesPosition(books, selectedSeries.id) : ""),
    releaseDate: book?.releaseDate ?? "",
    status: book?.status ?? "tbr",
    finishedDate: book?.finishedDate ?? "",
    sourceUrl: book?.sourceUrl ?? prefill?.sourceUrl ?? "",
    newSeriesName: "",
    newSeriesStatus: "incomplete",
    newSeriesNextTitle: "",
    newSeriesNextDate: "",
  };
}

export function BookEditor({
  book,
  preselectedSeriesId,
  prefill,
  books,
  series,
  saving,
  error,
  setError,
  clearError,
  coverClient,
  tagSuggestions,
  onSave,
  onClose,
}: {
  book?: Book;
  preselectedSeriesId?: string;
  prefill?: SharedBookDraft;
  books: Book[];
  series: Series[];
  saving: boolean;
  error: string;
  setError: (message: string) => void;
  clearError: () => void;
  coverClient?: CoverSearchClient;
  tagSuggestions: string[];
  onSave: (input: SaveBookInput) => Promise<{ snapshot: LibrarySnapshot }>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(book, preselectedSeriesId ?? "", prefill, series, books));
  const [tagInput, setTagInput] = useState("");
  const [dirty, setDirty] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ book: Book; keepOpen: boolean } | null>(null);
  const selectedSeries = draft.seriesId && draft.seriesId !== NEW_SERIES_VALUE
    ? series.find((item) => item.id === draft.seriesId)
    : undefined;
  const inheritedTags = selectedSeries?.tags ?? [];
  const bookSpecificTags = draft.tags.filter((tag) => !inheritedTags.includes(tag));

  function updateDraft(patch: Partial<BookDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    if ("title" in patch || "author" in patch) setDuplicateWarning(null);
    setDirty(true);
  }

  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("Discard the changes to this book?")) return;
    clearError();
    onClose();
  }

  function addTags(value: string) {
    const incoming = normalizeTags(value.split(",")).filter((tag) => !inheritedTags.includes(tag));
    if (!incoming.length) return;
    updateDraft({ tags: normalizeTags([...draft.tags, ...incoming]) });
    setTagInput("");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagInput);
    }
  }

  function changeSeries(seriesId: string) {
    if (seriesId === NEW_SERIES_VALUE) {
      updateDraft({ seriesId, seriesPosition: "1" });
      return;
    }
    const selected = series.find((item) => item.id === seriesId);
    const previous = series.find((item) => item.id === draft.seriesId);
    updateDraft({
      seriesId,
      author: selected && (!draft.author.trim() || draft.author === previous?.author)
        ? selected.author
        : draft.author,
      seriesPosition: selected ? nextSeriesPosition(books, selected.id) : "",
    });
  }

  async function chooseCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]).has(file.type)) {
      setError("Use a JPG, PNG, WebP, or GIF cover image.");
      return;
    }
    if (file.size > MAX_COVER_UPLOAD_BYTES) {
      setError("Cover images must be smaller than 20 MB.");
      return;
    }
    try {
      const coverImage = await readCoverImage(file);
      if (coverImage.length > MAX_COVER_DATA_URL_LENGTH) {
        setError("That cover is too large to store. Try a smaller image.");
        return;
      }
      updateDraft({ coverImage });
      clearError();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that cover image.");
    }
  }

  function saveInput(): SaveBookInput {
    return {
      id: book?.id,
      title: draft.title,
      author: draft.author,
      reason: draft.reason,
      tags: normalizeTags([...draft.tags, ...tagInput.split(",")]),
      coverImage: draft.coverImage,
      seriesId: draft.seriesId && draft.seriesId !== NEW_SERIES_VALUE ? draft.seriesId : null,
      seriesPosition: draft.seriesPosition,
      releaseDate: draft.releaseDate,
      status: draft.status,
      finishedDate: draft.finishedDate,
      sourceUrl: draft.sourceUrl,
      newSeries: draft.seriesId === NEW_SERIES_VALUE ? {
        name: draft.newSeriesName,
        author: draft.author,
        tags: [],
        status: draft.newSeriesStatus,
        nextReleaseTitle: draft.newSeriesNextTitle,
        nextReleaseDate: draft.newSeriesNextDate,
      } : undefined,
    };
  }

  async function persist(keepOpen: boolean, saveDuplicate = false) {
    const identityChanged = !book
      || draft.title.trim() !== book.title.trim()
      || draft.author.trim() !== book.author.trim();
    const duplicate = identityChanged
      ? findDuplicateBook(books, { id: book?.id, title: draft.title, author: draft.author })
      : undefined;
    if (duplicate && !saveDuplicate) {
      setDuplicateWarning({ book: duplicate, keepOpen });
      return;
    }
    clearError();
    setDuplicateWarning(null);
    try {
      const result = await onSave(saveInput());
      setDirty(false);
      if (!keepOpen) {
        onClose();
        return;
      }
      let nextSeriesId = draft.seriesId;
      if (nextSeriesId === NEW_SERIES_VALUE) {
        nextSeriesId = result.snapshot.series.find(
          (item) => item.nameKey === seriesNameKey(draft.newSeriesName),
        )?.id ?? "";
      }
      setTagInput("");
      setDraft(initialDraft(undefined, nextSeriesId, undefined, result.snapshot.series, result.snapshot.books));
    } catch {
      // The controller provides the visible error.
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persist(false);
  }

  return (
    <DialogShell labelledBy="book-dialog-title" onClose={requestClose}>
      <div className="dialog-grabber" aria-hidden="true" />
      <div className="dialog-heading"><div><p className="eyebrow">{book ? "Update the details" : "Add to the pile"}</p><h2 id="book-dialog-title">{book ? "Edit book" : "New book"}</h2></div><button className="close-button" type="button" onClick={requestClose} aria-label="Close">×</button></div>
      <form onSubmit={submit} noValidate>
        <div className="field-row">
          <label className="form-field"><span>Book title</span><input autoFocus required value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} /></label>
          <label className="form-field"><span>Author</span><input required value={draft.author} onChange={(event) => updateDraft({ author: event.target.value })} /></label>
        </div>
        <div className="form-field source-url-field">
          <div className="label-row">
            <label htmlFor="book-source-url">Where I found it <small>Optional</small></label>
            {/^https?:\/\//i.test(draft.sourceUrl.trim()) && <a href={draft.sourceUrl.trim()} target="_blank" rel="noreferrer">Open link ↗</a>}
          </div>
          <input id="book-source-url" aria-label="Where I found it" type="url" value={draft.sourceUrl} onChange={(event) => updateDraft({ sourceUrl: event.target.value })} placeholder="https://…" />
        </div>
        <div className="field-row">
          <label className="form-field"><span>Series</span><select value={draft.seriesId} onChange={(event) => changeSeries(event.target.value)}><option value="">Standalone book</option>{[...series].sort((a, b) => a.name.localeCompare(b.name)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}<option value={NEW_SERIES_VALUE}>＋ Create a new series</option></select></label>
          <label className="form-field"><span>Book release date <small>Optional</small></span><input type="date" value={draft.releaseDate} onChange={(event) => updateDraft({ releaseDate: event.target.value })} /></label>
        </div>
        <div className="field-row">
          <label className="form-field"><span>Reading status</span><select value={draft.status} onChange={(event) => {
            const status = event.target.value as BookStatus;
            updateDraft({
              status,
              finishedDate: status === "finished" || status === "dnf" ? draft.finishedDate : "",
            });
          }}><option value="tbr">To read</option><option value="reading">Reading</option><option value="finished">Finished</option><option value="dnf">Didn&apos;t finish</option></select></label>
          {(draft.status === "finished" || draft.status === "dnf") && <label className="form-field"><span>Finished date <small>Optional; defaults to today</small></span><input type="date" value={draft.finishedDate} onChange={(event) => updateDraft({ finishedDate: event.target.value })} /></label>}
        </div>
        {draft.seriesId && draft.seriesId !== NEW_SERIES_VALUE && <label className="form-field compact-field"><span>Position in series</span><input value={draft.seriesPosition} onChange={(event) => updateDraft({ seriesPosition: event.target.value })} placeholder="1, 2, 2.5, novella…" /></label>}
        {draft.seriesId === NEW_SERIES_VALUE && (
          <fieldset className="nested-fields"><legend>New series</legend><label className="form-field"><span>Series name</span><input value={draft.newSeriesName} onChange={(event) => updateDraft({ newSeriesName: event.target.value })} /></label><div className="field-row"><label className="form-field"><span>Position in series</span><input value={draft.seriesPosition} onChange={(event) => updateDraft({ seriesPosition: event.target.value })} /></label><label className="form-field"><span>Publishing status</span><select value={draft.newSeriesStatus} onChange={(event) => updateDraft({ newSeriesStatus: event.target.value as SeriesStatus, newSeriesNextTitle: event.target.value === "complete" ? "" : draft.newSeriesNextTitle, newSeriesNextDate: event.target.value === "complete" ? "" : draft.newSeriesNextDate })}><option value="incomplete">Ongoing</option><option value="complete">Finished publishing</option></select></label></div>{draft.newSeriesStatus === "incomplete" && <div className="field-row"><label className="form-field"><span>Next book title <small>Optional</small></span><input value={draft.newSeriesNextTitle} onChange={(event) => updateDraft({ newSeriesNextTitle: event.target.value })} /></label><label className="form-field"><span>Next release date <small>Optional</small></span><input type="date" value={draft.newSeriesNextDate} onChange={(event) => updateDraft({ newSeriesNextDate: event.target.value })} /></label></div>}</fieldset>
        )}

        <details className="more-details" open={Boolean(book)}>
          <summary><span>More details</span><small>Cover, notes, and tags</small></summary>
          <div className="more-details-content">
            <div className="cover-editor">
              <label className={`cover-picker cover-tone-${coverTone(book?.id ?? "new")}`}>
                {draft.coverImage ? (
                  <img src={draft.coverImage} alt="Selected cover preview" />
                ) : <span><b>＋</b>Add cover</span>}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void chooseCover(event)} />
              </label>
              <div><strong>Cover is optional</strong><p>Upload one, find one online for offline use, or paste an image address. Pasted addresses may not work offline.</p><input className="standard-input" type="url" value={draft.coverImage.startsWith("data:") ? "" : draft.coverImage} disabled={draft.coverImage.startsWith("data:")} onChange={(event) => updateDraft({ coverImage: event.target.value })} placeholder="https://…" />{draft.coverImage && <button className="danger-link" type="button" onClick={() => updateDraft({ coverImage: "" })}>Remove cover</button>}</div>
              <CoverSearch
                title={draft.title}
                author={draft.author}
                client={coverClient}
                setError={setError}
                clearError={clearError}
                onPick={async (dataUrl) => updateDraft({ coverImage: await shrinkCoverDataUrl(dataUrl) })}
              />
            </div>
            <label className="form-field"><span>Why did you want to read it? <small>Optional</small></span><textarea value={draft.reason} onChange={(event) => updateDraft({ reason: event.target.value })} rows={4} placeholder="What sold you on it?" /></label>
            {inheritedTags.length > 0 && <div className="inherited-series-tags"><small>From {selectedSeries?.name}</small><div>{inheritedTags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>}
            <div className="form-field"><div className="label-row"><span>Book-specific tags</span><small>No limit</small></div><div className="tag-entry">{bookSpecificTags.map((tag) => <button type="button" onClick={() => updateDraft({ tags: draft.tags.filter((item) => item !== tag) })} aria-label={`Remove ${tag}`} key={tag}>{tag} <span>×</span></button>)}<input aria-label="Add book-specific tags" value={tagInput} onChange={(event) => { setTagInput(event.target.value); setDirty(true); }} onKeyDown={handleTagKeyDown} onBlur={() => addTags(tagInput)} placeholder={bookSpecificTags.length ? "Add another…" : "slow burn, found family…"} /></div><TagSuggestions input={tagInput} tags={tagSuggestions} selected={[...draft.tags, ...inheritedTags]} onPick={addTags} /><small className="field-hint">These apply only to this book. Series tags appear above automatically.</small></div>
          </div>
        </details>

        {error && <p className="form-error" role="alert">{error}</p>}
        {duplicateWarning && (
          <div className="duplicate-warning" role="alert">
            <p><strong>Possible duplicate</strong> This already matches “{duplicateWarning.book.title}” by {duplicateWarning.book.author}.</p>
            <div>
              <button className="secondary-button" type="button" onClick={() => void persist(duplicateWarning.keepOpen, true)}>Save anyway</button>
              <button className="cancel-button" type="button" onClick={() => setDuplicateWarning(null)}>Go back and edit</button>
            </div>
          </div>
        )}
        <div className="dialog-actions"><button className="cancel-button" type="button" onClick={requestClose}>Cancel</button>{!book && <button className="secondary-button save-another-button" type="button" disabled={saving} onClick={() => void persist(true)}>Save & add another</button>}<button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : book ? "Save changes" : "Add to my TBR"}</button></div>
      </form>
    </DialogShell>
  );
}
