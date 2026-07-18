"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { normalizeTags } from "../../lib/library/model";
import type {
  SaveSeriesBookInput,
  SaveSeriesInput,
  Series,
  SeriesStatus,
} from "../../lib/library/types";
import { DialogShell } from "./dialog-shell";
import { TagSuggestions } from "./tag-suggestions";

type BatchMode = "none" | "numbered" | "individual";
type BatchRow = SaveSeriesBookInput & { key: string };

let batchRowKey = 0;

function keyedRow(title: string, seriesPosition: string): BatchRow {
  batchRowKey += 1;
  return { key: `batch-book-${batchRowKey}`, title, seriesPosition };
}

function numberedRows(baseTitle: string, startValue: string, countValue: string): BatchRow[] {
  const title = baseTitle.trim();
  const start = Number.parseInt(startValue, 10);
  const count = Number.parseInt(countValue, 10);
  if (!title || !Number.isFinite(start) || !Number.isFinite(count) || count < 1 || count > 99) return [];
  return Array.from({ length: count }, (_, index) => {
    const position = start + index;
    return keyedRow(`${title} ${position}`, String(position));
  });
}

function individualRows(value: string): BatchRow[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean)
    .map((line, index) => {
      const numbered = line.match(/^(\d+(?:\.\d+)?)\s*(?:[.)|:\-])\s*(.+)$/);
      return keyedRow(numbered?.[2]?.trim() || line, numbered?.[1] || String(index + 1));
    });
}

export function SeriesEditor({
  series,
  linkedBookCount,
  saving,
  error,
  setError,
  clearError,
  tagSuggestions,
  onSave,
  onDelete,
  onClose,
}: {
  series?: Series;
  linkedBookCount: number;
  saving: boolean;
  error: string;
  setError: (message: string) => void;
  clearError: () => void;
  tagSuggestions: string[];
  onSave: (input: SaveSeriesInput) => Promise<unknown>;
  onDelete: (series: Series, linkedBookCount: number) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    name: series?.name ?? "",
    author: series?.author ?? "",
    tags: series?.tags ?? [],
    status: series?.status ?? "incomplete" as SeriesStatus,
    nextReleaseTitle: series?.nextReleaseTitle ?? "",
    nextReleaseDate: series?.nextReleaseDate ?? "",
    notes: series?.notes ?? "",
  }));
  const [batchMode, setBatchMode] = useState<BatchMode>("none");
  const [baseTitle, setBaseTitle] = useState("");
  const [startNumber, setStartNumber] = useState("1");
  const [bookCount, setBookCount] = useState("3");
  const [titleList, setTitleList] = useState("");
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [dirty, setDirty] = useState(false);

  function update(patch: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  function changeBatchMode(mode: BatchMode) {
    setBatchMode(mode);
    setBatchRows([]);
    setDirty(true);
    clearError();
  }

  function addTags(value: string) {
    const incoming = normalizeTags(value.split(","));
    if (!incoming.length) return;
    update({ tags: normalizeTags([...draft.tags, ...incoming]) });
    setTagInput("");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagInput);
    }
  }

  function invalidatePreview(action: () => void) {
    action();
    setBatchRows([]);
    setDirty(true);
  }

  function generatedRows() {
    if (batchMode === "numbered") return numberedRows(baseTitle || draft.name, startNumber, bookCount);
    if (batchMode === "individual") return individualRows(titleList);
    return [];
  }

  function buildPreview() {
    const rows = generatedRows();
    if (!rows.length) {
      setError(batchMode === "numbered"
        ? "Add a base title and choose between 1 and 99 books."
        : "Paste at least one book title, one title per line.");
      return [];
    }
    clearError();
    setBatchRows(rows);
    return rows;
  }

  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("Discard the changes to this series?")) return;
    clearError();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    const books = !series && batchMode !== "none"
      ? batchRows.length ? batchRows : buildPreview()
      : [];
    if (!series && batchMode !== "none" && !books.length) return;
    try {
      await onSave({
        id: series?.id,
        ...draft,
        tags: normalizeTags([...draft.tags, ...tagInput.split(",")]),
        books: books.map(({ title, seriesPosition }) => ({ title, seriesPosition })),
      });
      setDirty(false);
      onClose();
    } catch {
      // The controller provides the visible error.
    }
  }

  return (
    <DialogShell labelledBy="series-dialog-title" className="series-dialog" onClose={requestClose}>
      <div className="dialog-grabber" aria-hidden="true" />
      <div className="dialog-heading"><div><p className="eyebrow">One source of truth</p><h2 id="series-dialog-title">{series ? "Edit series" : "New series"}</h2></div><button className="close-button" type="button" onClick={requestClose} aria-label="Close">×</button></div>
      <form onSubmit={submit} noValidate>
        <div className="field-row">
          <label className="form-field"><span>Series name</span><input autoFocus required value={draft.name} onChange={(event) => update({ name: event.target.value })} /></label>
          <label className="form-field"><span>Series author</span><input value={draft.author} onChange={(event) => update({ author: event.target.value })} placeholder="Used for new books" /></label>
        </div>
        <p className="field-hint series-author-hint">New books inherit this author. You can still change an individual book when needed.</p>
        <div className="form-field"><div className="label-row"><span>Series tags</span><small>Inherited by every linked book</small></div><div className="tag-entry">{draft.tags.map((tag) => <button type="button" onClick={() => update({ tags: draft.tags.filter((item) => item !== tag) })} aria-label={`Remove ${tag}`} key={tag}>{tag} <span>×</span></button>)}<input aria-label="Add series tags" value={tagInput} onChange={(event) => { setTagInput(event.target.value); setDirty(true); }} onKeyDown={handleTagKeyDown} onBlur={() => addTags(tagInput)} placeholder={draft.tags.length ? "Add another…" : "fantasy, progression…"} /></div><TagSuggestions input={tagInput} tags={tagSuggestions} selected={draft.tags} onPick={addTags} /><small className="field-hint">Add a tag once here and it appears on every book in the series.</small></div>
        <label className="form-field"><span>Publishing status</span><select value={draft.status} onChange={(event) => update({ status: event.target.value as SeriesStatus, nextReleaseTitle: event.target.value === "complete" ? "" : draft.nextReleaseTitle, nextReleaseDate: event.target.value === "complete" ? "" : draft.nextReleaseDate })}><option value="incomplete">Ongoing</option><option value="complete">Finished publishing</option></select></label>
        {draft.status === "incomplete" && <div className="field-row"><label className="form-field"><span>Next book title <small>Optional</small></span><input value={draft.nextReleaseTitle} onChange={(event) => update({ nextReleaseTitle: event.target.value })} /></label><label className="form-field"><span>Next release date <small>Optional</small></span><input type="date" value={draft.nextReleaseDate} onChange={(event) => update({ nextReleaseDate: event.target.value })} /></label></div>}

        {!series && (
          <fieldset className="batch-series-fields">
            <legend>Add books now?</legend>
            <p className="batch-intro">Create the whole run at once, or start with an empty series.</p>
            <div className="batch-mode-options">
              {([
                ["none", "Not now", "Create the series only"],
                ["numbered", "Numbered titles", "Same title followed by 1, 2, 3…"],
                ["individual", "Individual titles", "Paste different titles in reading order"],
              ] as [BatchMode, string, string][]).map(([value, label, description]) => (
                <label className={batchMode === value ? "active" : ""} key={value}>
                  <input type="radio" name="batch-mode" value={value} checked={batchMode === value} onChange={() => changeBatchMode(value)} />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </label>
              ))}
            </div>

            {batchMode === "numbered" && (
              <div className="batch-builder">
                <div className="field-row numbered-fields">
                  <label className="form-field"><span>Book title</span><input value={baseTitle} onChange={(event) => invalidatePreview(() => setBaseTitle(event.target.value))} placeholder={draft.name || "Series title"} /></label>
                  <label className="form-field"><span>First number</span><input type="number" min="0" value={startNumber} onChange={(event) => invalidatePreview(() => setStartNumber(event.target.value))} /></label>
                  <label className="form-field"><span>How many?</span><input type="number" min="1" max="99" value={bookCount} onChange={(event) => invalidatePreview(() => setBookCount(event.target.value))} /></label>
                </div>
                <button className="secondary-button preview-button" type="button" onClick={buildPreview}>Preview books</button>
              </div>
            )}

            {batchMode === "individual" && (
              <div className="batch-builder">
                <label className="form-field"><span>Book titles <small>One per line</small></span><textarea rows={6} value={titleList} onChange={(event) => invalidatePreview(() => setTitleList(event.target.value))} placeholder={"Unsouled\nSoulsmith\nBlackflame"} /></label>
                <p className="field-hint">You can also paste numbered lines such as “1. Unsouled”.</p>
                <button className="secondary-button preview-button" type="button" onClick={buildPreview}>Preview books</button>
              </div>
            )}

            {batchRows.length > 0 && (
              <div className="batch-preview" aria-label="Books to create">
                <div className="batch-preview-heading"><div><strong>{batchRows.length} {batchRows.length === 1 ? "book" : "books"} ready</strong><small>Edit anything before saving.</small></div><button type="button" onClick={() => setBatchRows([])}>Clear</button></div>
                <div className="batch-rows">
                  {batchRows.map((row, index) => (
                    <div className="batch-row" key={row.key}>
                      <label><span className="sr-only">Position for book {index + 1}</span><input aria-label={`Position for book ${index + 1}`} value={row.seriesPosition} onChange={(event) => { setBatchRows((current) => current.map((item) => item.key === row.key ? { ...item, seriesPosition: event.target.value } : item)); setDirty(true); }} /></label>
                      <label><span className="sr-only">Title for book {index + 1}</span><input aria-label={`Title for book ${index + 1}`} value={row.title} onChange={(event) => { setBatchRows((current) => current.map((item) => item.key === row.key ? { ...item, title: event.target.value } : item)); setDirty(true); }} /></label>
                      <button type="button" onClick={() => { setBatchRows((current) => current.filter((item) => item.key !== row.key)); setDirty(true); }} aria-label={`Remove ${row.title || `book ${index + 1}`}`}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </fieldset>
        )}

        <label className="form-field"><span>Series notes <small>Optional</small></span><textarea value={draft.notes} onChange={(event) => update({ notes: event.target.value })} rows={4} placeholder="Reading order, spin-offs, or anything else worth remembering…" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions series-actions">{series && <button className="danger-button" type="button" onClick={() => void onDelete(series, linkedBookCount)}>Delete series</button>}<span /><button className="cancel-button" type="button" onClick={requestClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : series ? "Save series" : batchRows.length ? `Create series + ${batchRows.length}` : "Create series"}</button></div>
      </form>
    </DialogShell>
  );
}
