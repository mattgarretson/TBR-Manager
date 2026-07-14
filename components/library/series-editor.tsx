"use client";

import { useState, type FormEvent } from "react";
import type { SaveSeriesInput, Series, SeriesStatus } from "../../lib/library/types";
import { DialogShell } from "./dialog-shell";

export function SeriesEditor({
  series,
  linkedBookCount,
  saving,
  error,
  clearError,
  onSave,
  onDelete,
  onClose,
}: {
  series?: Series;
  linkedBookCount: number;
  saving: boolean;
  error: string;
  clearError: () => void;
  onSave: (input: SaveSeriesInput) => Promise<unknown>;
  onDelete: (series: Series, linkedBookCount: number) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    name: series?.name ?? "",
    status: series?.status ?? "incomplete" as SeriesStatus,
    nextReleaseTitle: series?.nextReleaseTitle ?? "",
    nextReleaseDate: series?.nextReleaseDate ?? "",
    notes: series?.notes ?? "",
  }));
  const [dirty, setDirty] = useState(false);

  function update(patch: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
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
    try {
      await onSave({ id: series?.id, ...draft });
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
        <label className="form-field"><span>Series name</span><input autoFocus required value={draft.name} onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="form-field"><span>Series status</span><select value={draft.status} onChange={(event) => update({ status: event.target.value as SeriesStatus, nextReleaseTitle: event.target.value === "complete" ? "" : draft.nextReleaseTitle, nextReleaseDate: event.target.value === "complete" ? "" : draft.nextReleaseDate })}><option value="incomplete">Incomplete</option><option value="complete">Complete</option></select></label>
        {draft.status === "incomplete" && <div className="field-row"><label className="form-field"><span>Next book title <small>Optional</small></span><input value={draft.nextReleaseTitle} onChange={(event) => update({ nextReleaseTitle: event.target.value })} /></label><label className="form-field"><span>Next release date <small>Optional</small></span><input type="date" value={draft.nextReleaseDate} onChange={(event) => update({ nextReleaseDate: event.target.value })} /></label></div>}
        <label className="form-field"><span>Series notes <small>Optional</small></span><textarea value={draft.notes} onChange={(event) => update({ notes: event.target.value })} rows={4} placeholder="Reading order, spin-offs, or anything else worth remembering…" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions series-actions">{series && <button className="danger-button" type="button" onClick={() => void onDelete(series, linkedBookCount)}>Delete series</button>}<span /><button className="cancel-button" type="button" onClick={requestClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save series"}</button></div>
      </form>
    </DialogShell>
  );
}

