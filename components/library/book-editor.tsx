"use client";

import { useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { MAX_COVER_FILE_BYTES, normalizeTags } from "../../lib/library/model";
import type { Book, SaveBookInput, Series, SeriesStatus } from "../../lib/library/types";
import { DialogShell } from "./dialog-shell";
import { coverTone, readImage } from "./view-utils";

const NEW_SERIES_VALUE = "__new_series__";

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

function initialDraft(book?: Book, preselectedSeriesId = ""): BookDraft {
  return {
    title: book?.title ?? "",
    author: book?.author ?? "",
    reason: book?.reason ?? "",
    tags: book?.tags ?? [],
    coverImage: book?.coverImage ?? "",
    seriesId: book?.seriesId ?? preselectedSeriesId,
    seriesPosition: book?.seriesPosition ?? "",
    releaseDate: book?.releaseDate ?? "",
    newSeriesName: "",
    newSeriesStatus: "incomplete",
    newSeriesNextTitle: "",
    newSeriesNextDate: "",
  };
}

export function BookEditor({
  book,
  preselectedSeriesId,
  series,
  saving,
  error,
  setError,
  clearError,
  onSave,
  onClose,
}: {
  book?: Book;
  preselectedSeriesId?: string;
  series: Series[];
  saving: boolean;
  error: string;
  setError: (message: string) => void;
  clearError: () => void;
  onSave: (input: SaveBookInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(book, preselectedSeriesId));
  const [tagInput, setTagInput] = useState("");
  const [dirty, setDirty] = useState(false);

  function updateDraft(patch: Partial<BookDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("Discard the changes to this book?")) return;
    clearError();
    onClose();
  }

  function addTags(value: string) {
    const incoming = normalizeTags(value.split(","));
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

  async function chooseCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]).has(file.type)) {
      setError("Use a JPG, PNG, WebP, or GIF cover image.");
      return;
    }
    if (file.size > MAX_COVER_FILE_BYTES) {
      setError("Cover images must be smaller than 5 MB.");
      return;
    }
    try {
      updateDraft({ coverImage: await readImage(file) });
      clearError();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that cover image.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    try {
      await onSave({
        id: book?.id,
        title: draft.title,
        author: draft.author,
        reason: draft.reason,
        tags: normalizeTags([...draft.tags, ...tagInput.split(",")]),
        coverImage: draft.coverImage,
        seriesId: draft.seriesId && draft.seriesId !== NEW_SERIES_VALUE ? draft.seriesId : null,
        seriesPosition: draft.seriesPosition,
        releaseDate: draft.releaseDate,
        newSeries: draft.seriesId === NEW_SERIES_VALUE ? {
          name: draft.newSeriesName,
          status: draft.newSeriesStatus,
          nextReleaseTitle: draft.newSeriesNextTitle,
          nextReleaseDate: draft.newSeriesNextDate,
        } : undefined,
      });
      setDirty(false);
      onClose();
    } catch {
      // The controller provides the visible error.
    }
  }

  return (
    <DialogShell labelledBy="book-dialog-title" onClose={requestClose}>
      <div className="dialog-grabber" aria-hidden="true" />
      <div className="dialog-heading"><div><p className="eyebrow">{book ? "Update the details" : "Add to the pile"}</p><h2 id="book-dialog-title">{book ? "Edit book" : "New book"}</h2></div><button className="close-button" type="button" onClick={requestClose} aria-label="Close">×</button></div>
      <form onSubmit={submit} noValidate>
        <div className="cover-editor">
          <label className={`cover-picker cover-tone-${coverTone((book?.id ?? draft.title) || "new")}`}>
            {draft.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.coverImage} alt="Selected cover preview" />
            ) : <span><b>＋</b>Add cover</span>}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void chooseCover(event)} />
          </label>
          <div><strong>Cover is optional</strong><p>Upload one for offline use, or paste an image address. Pasted addresses may not work offline.</p><input className="standard-input" type="url" value={draft.coverImage.startsWith("data:") ? "" : draft.coverImage} disabled={draft.coverImage.startsWith("data:")} onChange={(event) => updateDraft({ coverImage: event.target.value })} placeholder="https://…" />{draft.coverImage && <button className="danger-link" type="button" onClick={() => updateDraft({ coverImage: "" })}>Remove cover</button>}</div>
        </div>

        <div className="field-row">
          <label className="form-field"><span>Book title</span><input autoFocus required value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} /></label>
          <label className="form-field"><span>Author</span><input required value={draft.author} onChange={(event) => updateDraft({ author: event.target.value })} /></label>
        </div>
        <div className="field-row">
          <label className="form-field"><span>Series</span><select value={draft.seriesId} onChange={(event) => updateDraft({ seriesId: event.target.value })}><option value="">Standalone book</option>{[...series].sort((a, b) => a.name.localeCompare(b.name)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}<option value={NEW_SERIES_VALUE}>＋ Create a new series</option></select></label>
          <label className="form-field"><span>Book release date <small>Optional</small></span><input type="date" value={draft.releaseDate} onChange={(event) => updateDraft({ releaseDate: event.target.value })} /></label>
        </div>
        {draft.seriesId && draft.seriesId !== NEW_SERIES_VALUE && <label className="form-field compact-field"><span>Position in series <small>Optional</small></span><input value={draft.seriesPosition} onChange={(event) => updateDraft({ seriesPosition: event.target.value })} placeholder="1, 2, 2.5, novella…" /></label>}
        {draft.seriesId === NEW_SERIES_VALUE && (
          <fieldset className="nested-fields"><legend>New series</legend><label className="form-field"><span>Series name</span><input value={draft.newSeriesName} onChange={(event) => updateDraft({ newSeriesName: event.target.value })} /></label><div className="field-row"><label className="form-field"><span>Status</span><select value={draft.newSeriesStatus} onChange={(event) => updateDraft({ newSeriesStatus: event.target.value as SeriesStatus, newSeriesNextTitle: event.target.value === "complete" ? "" : draft.newSeriesNextTitle, newSeriesNextDate: event.target.value === "complete" ? "" : draft.newSeriesNextDate })}><option value="incomplete">Incomplete</option><option value="complete">Complete</option></select></label>{draft.newSeriesStatus === "incomplete" && <label className="form-field"><span>Next release date <small>Optional</small></span><input type="date" value={draft.newSeriesNextDate} onChange={(event) => updateDraft({ newSeriesNextDate: event.target.value })} /></label>}</div>{draft.newSeriesStatus === "incomplete" && <label className="form-field"><span>Next book title <small>Optional</small></span><input value={draft.newSeriesNextTitle} onChange={(event) => updateDraft({ newSeriesNextTitle: event.target.value })} /></label>}</fieldset>
        )}
        <label className="form-field"><span>Why did you want to read it? <small>Optional</small></span><textarea value={draft.reason} onChange={(event) => updateDraft({ reason: event.target.value })} rows={4} placeholder="What sold you on it?" /></label>
        <div className="form-field"><div className="label-row"><span>Tropes & tags</span><small>No limit</small></div><div className="tag-entry">{draft.tags.map((tag) => <button type="button" onClick={() => updateDraft({ tags: draft.tags.filter((item) => item !== tag) })} aria-label={`Remove ${tag}`} key={tag}>{tag} <span>×</span></button>)}<input value={tagInput} onChange={(event) => { setTagInput(event.target.value); setDirty(true); }} onKeyDown={handleTagKeyDown} onBlur={() => addTags(tagInput)} placeholder={draft.tags.length ? "Add another…" : "slow burn, found family…"} /></div><small className="field-hint">Press enter or use commas between tags.</small></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="cancel-button" type="button" onClick={requestClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : book ? "Save changes" : "Add to my TBR"}</button></div>
      </form>
    </DialogShell>
  );
}
