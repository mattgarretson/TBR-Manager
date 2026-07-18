"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { THEMES, type InstallPromptEvent } from "../../app/use-device-settings";
import { selectStoredTagCounts } from "../../lib/library/selectors";
import type { Book, Series, ThemeName } from "../../lib/library/types";
import styles from "./settings-view.module.css";

export type DeviceSettings = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  installPrompt: InstallPromptEvent | null;
  isInstalled: boolean;
  isIos: boolean;
  storagePersistent: boolean | null;
  canPersistStorage: boolean;
  installApp: () => Promise<void>;
  protectStorage: () => Promise<void>;
};

export function SettingsView({
  books,
  series,
  pendingLegacyCovers,
  saving,
  lastBackupAt,
  device,
  onDownload,
  onAddFromLinks,
  onImport,
  onErase,
  onRenameTag,
  onDeleteTag,
}: {
  books: Book[];
  series: Series[];
  pendingLegacyCovers: number;
  saving: boolean;
  lastBackupAt: string | null;
  device: DeviceSettings;
  onDownload: () => void;
  onAddFromLinks: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onErase: () => void;
  onRenameTag: (currentTag: string, nextTag: string) => Promise<void>;
  onDeleteTag: (tag: string) => Promise<void>;
}) {
  const tagCounts = useMemo(() => selectStoredTagCounts(books, series), [books, series]);
  const [editingTag, setEditingTag] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const lastBackupLabel = lastBackupAt
    ? new Date(lastBackupAt).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    : "";

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onRenameTag(editingTag, renameValue);
      setEditingTag("");
      setRenameValue("");
    } catch {}
  }

  async function deleteTag(tag: string, count: number) {
    if (!window.confirm(`Delete “${tag}” from ${count} ${count === 1 ? "item" : "items"}?`)) return;
    try {
      await onDeleteTag(tag);
      if (editingTag === tag) {
        setEditingTag("");
        setRenameValue("");
      }
    } catch {}
  }

  return (
    <section className="page settings-page" aria-labelledby="settings-title">
      <div className="page-heading"><div><p className="eyebrow">Install, protect, and move it</p><h1 id="settings-title">More</h1></div></div>
      <div className={`settings-grid ${styles.grid}`}>
        <article className={`settings-card ${styles.card} ${styles.installCard}`}>
          <span className={`settings-icon ${styles.icon}`} aria-hidden="true">⌂</span>
          <div><p className="eyebrow">Phone app</p><h2>{device.isInstalled ? "Installed" : "Install Plot Pile"}</h2>
            {device.isInstalled ? <p>It is running as a standalone app on this device.</p> : device.installPrompt ? <><p>Install it for a home-screen icon and offline access.</p><button className="primary-button" type="button" onClick={() => void device.installApp()}>Install app</button></> : device.isIos ? <p>In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p> : <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>}
          </div>
        </article>
        <article className={`settings-card ${styles.card} ${styles.themeCard}`}>
          <span className={`settings-icon ${styles.icon}`} aria-hidden="true">◐</span>
          <div><p className="eyebrow">Color scheme</p><h2>Make it yours</h2><p>Choose a palette. The selection stays on this device.</p>
            <div className={`theme-options ${styles.themeOptions}`} role="group" aria-label="Choose a color scheme">
              {THEMES.map((item) => (
                <button aria-label={item.name} className={device.theme === item.id ? `active ${styles.active}` : ""} type="button" onClick={() => device.setTheme(item.id)} aria-pressed={device.theme === item.id} key={item.id}>
                  <span className={`theme-swatch ${styles.swatch} ${styles[item.id]}`} aria-hidden="true"><i /><i /><i /></span>
                  <span><strong>{item.name}</strong><small>{item.description}</small></span>
                </button>
              ))}
            </div>
          </div>
        </article>
        <article className={`settings-card ${styles.card}`}>
          <span className={`settings-icon ${styles.icon}`} aria-hidden="true">▣</span>
          <div><p className="eyebrow">On-device storage</p><h2>{books.length} books · {series.length} series</h2><p>Your library lives in this browser on this phone. It works offline and does not require an account.</p>
            {pendingLegacyCovers > 0 && <p role="status">{pendingLegacyCovers} old {pendingLegacyCovers === 1 ? "cover is" : "covers are"} still waiting to be copied. Plot Pile will retry next time it opens online.</p>}
            {device.storagePersistent === true ? <span className={styles.protectedLabel}>✓ Storage protection enabled</span> : device.canPersistStorage && <button className="secondary-button" type="button" onClick={() => void device.protectStorage()}>Protect local storage</button>}
          </div>
        </article>
        <article className={`settings-card ${styles.card} ${styles.tagCard}`}>
          <span className={`settings-icon ${styles.icon}`} aria-hidden="true">#</span>
          <div><p className="eyebrow">Tags</p><h2>Manage tags</h2><p>Rename or remove tags everywhere they are stored.</p>
            {tagCounts.length ? (
              <div className={styles.tagList}>
                {tagCounts.map(([tag, count]) => (
                  <div className={styles.tagRow} key={tag}>
                    {editingTag === tag ? (
                      <form onSubmit={(event) => void submitRename(event)}>
                        <label><span className="sr-only">New name for {tag}</span><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label>
                        <button className="secondary-button" type="submit" disabled={saving}>Save</button>
                        <button className="cancel-button" type="button" onClick={() => setEditingTag("")}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span><strong>{tag}</strong><small>{count} {count === 1 ? "use" : "uses"}</small></span>
                        <button className="text-action" type="button" disabled={saving} onClick={() => { setEditingTag(tag); setRenameValue(tag); }} aria-label={`Rename ${tag}`}>Rename</button>
                        <button className="danger-link" type="button" disabled={saving} onClick={() => void deleteTag(tag, count)} aria-label={`Delete ${tag}`}>Delete</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className={styles.emptyTags}>Tags added to books or series will appear here.</p>}
          </div>
        </article>
        <article className={`settings-card ${styles.card}`}>
          <span className={`settings-icon ${styles.icon}`} aria-hidden="true">↗</span>
          <div><p className="eyebrow">Tab cleanup</p><h2>Add from links</h2><p>Paste a group of Goodreads, store, or social links and review them before adding the books.</p><button className="secondary-button" type="button" onClick={onAddFromLinks}>Add from links</button></div>
        </article>
        <article className={`settings-card ${styles.card}`}>
          <span className={`settings-icon ${styles.icon}`} aria-hidden="true">⇩</span>
          <div><p className="eyebrow">Backup</p><h2>Download a copy</h2><p>The backup includes books, series, notes, tags, dates, and uploaded covers.</p><p className={styles.lastBackup}>{lastBackupLabel ? `Last backup: ${lastBackupLabel}` : "No backup yet"}</p><button className="secondary-button" type="button" onClick={onDownload}>Download backup</button></div>
        </article>
        <article className={`settings-card ${styles.card}`}>
          <span className={`settings-icon ${styles.icon}`} aria-hidden="true">⇧</span>
          <div><p className="eyebrow">Restore or move</p><h2>Import a backup</h2><p>Use a backup to recover the library or move it to another phone or browser.</p><label className={`secondary-button file-button ${styles.fileButton}`}>Choose backup<input type="file" accept="application/json,.json" onChange={onImport} /></label></div>
        </article>
        <article className={`settings-card ${styles.card} ${styles.dangerCard}`}>
          <span className={`settings-icon ${styles.icon}`} aria-hidden="true">!</span>
          <div><p className="eyebrow">Danger zone</p><h2>Erase this device</h2><p>This permanently removes the local library from this browser. It does not affect a backup file.</p><button className="danger-button" type="button" onClick={onErase}>Erase local library</button></div>
        </article>
      </div>
    </section>
  );
}
