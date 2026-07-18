"use client";

import { useState, type FormEvent } from "react";
import { findDuplicateBook } from "../../lib/library/model";
import type {
  Book,
  SaveBookBatchInput,
} from "../../lib/library/types";
import { parseSharedLinks, type SharedBookDraft } from "../../lib/share/parse";
import { DialogShell } from "./dialog-shell";

type LinkDraftRow = SharedBookDraft & {
  key: string;
  selected: boolean;
  duplicate?: Book;
};

let linkRowKey = 0;

function previewRows(value: string, books: readonly Book[]): LinkDraftRow[] {
  return parseSharedLinks(value).map((draft) => {
    const duplicate = findDuplicateBook(books, draft);
    linkRowKey += 1;
    return {
      ...draft,
      key: `link-draft-${linkRowKey}`,
      selected: !duplicate,
      duplicate,
    };
  });
}

export function LinkImport({
  initialText = "",
  books,
  saving,
  error,
  setError,
  clearError,
  onSave,
  onClose,
}: {
  initialText?: string;
  books: Book[];
  saving: boolean;
  error: string;
  setError: (message: string) => void;
  clearError: () => void;
  onSave: (inputs: SaveBookBatchInput[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState(() => initialText ? previewRows(initialText, books) : []);
  const [dirty, setDirty] = useState(false);
  const selectedCount = rows.filter((row) => row.selected).length;

  function buildPreview() {
    const nextRows = previewRows(text, books);
    if (!nextRows.length) {
      setError("Paste at least one HTTP or HTTPS link.");
      return;
    }
    clearError();
    setRows(nextRows);
  }

  function updateIdentity(key: string, patch: Pick<Partial<LinkDraftRow>, "title" | "author">) {
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const updated = { ...row, ...patch };
      const duplicate = findDuplicateBook(books, updated);
      return {
        ...updated,
        duplicate,
        selected: duplicate && duplicate.id !== row.duplicate?.id ? false : row.selected,
      };
    }));
    setDirty(true);
  }

  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("Discard this link import?")) return;
    clearError();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = rows.filter((row) => row.selected);
    if (!selected.length) {
      setError("Choose at least one book to add.");
      return;
    }
    clearError();
    try {
      await onSave(selected.map(({ title, author, sourceUrl }) => ({ title, author, sourceUrl })));
      setDirty(false);
      onClose();
    } catch {
      // The controller provides the visible error.
    }
  }

  return (
    <DialogShell labelledBy="link-import-title" className="link-import-dialog" onClose={requestClose}>
      <div className="dialog-grabber" aria-hidden="true" />
      <div className="dialog-heading">
        <div><p className="eyebrow">Clear the tab backlog</p><h2 id="link-import-title">Add from links</h2></div>
        <button className="close-button" type="button" onClick={requestClose} aria-label="Close">×</button>
      </div>
      <form onSubmit={submit} noValidate>
        <label className="form-field">
          <span>Links to books</span>
          <textarea
            autoFocus
            rows={6}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setRows([]);
              setDirty(true);
            }}
            placeholder={"Paste a group of links or any text containing them…\nhttps://www.goodreads.com/book/show/…"}
          />
        </label>
        <p className="field-hint link-import-hint">Plot Pile only makes best-effort guesses. Review every title and author before saving.</p>
        <button className="secondary-button preview-button" type="button" onClick={buildPreview}>Preview links</button>

        {rows.length > 0 && (
          <div className="batch-preview link-import-preview" aria-label="Books from links">
            <div className="batch-preview-heading">
              <div><strong>{rows.length} {rows.length === 1 ? "link" : "links"} found</strong><small>{selectedCount} selected · edit anything before saving</small></div>
              <button type="button" onClick={() => setRows([])}>Clear</button>
            </div>
            <div className="link-import-rows">
              {rows.map((row, index) => (
                <div className={`link-import-row${row.duplicate ? " duplicate" : ""}`} key={row.key}>
                  <label className="link-import-choice">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(event) => {
                        setRows((current) => current.map((item) => item.key === row.key ? { ...item, selected: event.target.checked } : item));
                        setDirty(true);
                      }}
                      aria-label={`Include ${row.title || `link ${index + 1}`}`}
                    />
                    <span className="sr-only">Include this book</span>
                  </label>
                  <div className="link-import-fields">
                    <label>
                      <span>Title</span>
                      <input aria-label={`Title for link ${index + 1}`} value={row.title} onChange={(event) => updateIdentity(row.key, { title: event.target.value })} placeholder="Book title" />
                    </label>
                    <label>
                      <span>Author</span>
                      <input aria-label={`Author for link ${index + 1}`} value={row.author} onChange={(event) => updateIdentity(row.key, { author: event.target.value })} placeholder="Author" />
                    </label>
                    <label className="link-import-source">
                      <span>Source URL</span>
                      <input
                        aria-label={`Source URL for link ${index + 1}`}
                        type="url"
                        value={row.sourceUrl}
                        onChange={(event) => {
                          setRows((current) => current.map((item) => item.key === row.key ? { ...item, sourceUrl: event.target.value } : item));
                          setDirty(true);
                        }}
                      />
                    </label>
                    {row.duplicate && <span className="link-duplicate-flag">Already in library: {row.duplicate.title} by {row.duplicate.author}</span>}
                  </div>
                  <button className="link-import-remove" type="button" onClick={() => {
                    setRows((current) => current.filter((item) => item.key !== row.key));
                    setDirty(true);
                  }} aria-label={`Remove link ${index + 1}`}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="cancel-button" type="button" onClick={requestClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={saving || !rows.length}>
            {saving ? "Saving…" : `Save ${selectedCount} ${selectedCount === 1 ? "book" : "books"}`}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
