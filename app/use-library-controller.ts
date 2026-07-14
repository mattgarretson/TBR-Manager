"use client";

import { useEffect, useMemo, useState } from "react";
import { IndexedDbLibraryRepository } from "../lib/library/indexeddb-repository";
import { migrateLegacyLibrary } from "../lib/library/legacy";
import type { LibraryRepository } from "../lib/library/repository";
import { LibraryService } from "../lib/library/service";
import type { LibrarySnapshot, SaveBookInput, SaveSeriesInput } from "../lib/library/types";
import { currentLocalDate } from "../lib/library/model";
import { libraryErrorMessage } from "../lib/library/errors";

const emptySnapshot: LibrarySnapshot = { books: [], series: [] };

export type LibraryControllerDependencies = {
  repository?: LibraryRepository;
  service?: LibraryService;
  migrate?: typeof migrateLegacyLibrary;
};

export function useLibraryController(dependencies: LibraryControllerDependencies = {}) {
  const repository = useMemo(
    () => dependencies.repository ?? new IndexedDbLibraryRepository(),
    [dependencies.repository],
  );
  const service = useMemo(
    () => dependencies.service ?? new LibraryService(repository),
    [dependencies.service, repository],
  );
  const migrate = dependencies.migrate ?? migrateLegacyLibrary;
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingLegacyCovers, setPendingLegacyCovers] = useState(0);

  useEffect(() => {
    let active = true;
    async function start() {
      let migrationNotice = "";
      try {
        try {
          const result = await migrate({ repository, storage: window.localStorage });
          if (result.importedBooks) {
            migrationNotice = `Moved ${result.importedBooks} ${result.importedBooks === 1 ? "book" : "books"} onto this device`;
          }
          if (active) setPendingLegacyCovers(result.pendingCovers);
        } catch (caught) {
          if (active) setError(caught instanceof Error ? caught.message : "Your old shelf could not be copied yet.");
        }
        const nextSnapshot = await service.read();
        if (!active) return;
        setSnapshot(nextSnapshot);
        if (migrationNotice) setNotice(migrationNotice);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not open the on-device library.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void start();
    return () => {
      active = false;
    };
  }, [migrate, repository, service]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function command<T>(action: () => Promise<T>) {
    setSaving(true);
    setError("");
    try {
      return await action();
    } catch (caught) {
      const nextError = libraryErrorMessage(caught, "That change could not be saved.");
      setError(nextError);
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function saveBook(input: SaveBookInput) {
    const result = await command(() => service.saveBook(input));
    setSnapshot(result.snapshot);
    setNotice(result.created ? "Added to your TBR" : "Book updated");
    return result;
  }

  async function saveSeries(input: SaveSeriesInput) {
    const result = await command(() => service.saveSeries(input));
    setSnapshot(result.snapshot);
    setNotice(result.created ? "Series created" : "Series updated everywhere");
    return result;
  }

  async function deleteBook(id: string) {
    const nextSnapshot = await command(() => service.deleteBook(id));
    setSnapshot(nextSnapshot);
    setNotice("Book removed");
  }

  async function deleteSeries(id: string) {
    const nextSnapshot = await command(() => service.deleteSeries(id));
    setSnapshot(nextSnapshot);
    setNotice("Series removed; books kept");
  }

  function downloadBackup() {
    try {
      const backup = service.createBackup(snapshot);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `plot-pile-backup-${currentLocalDate()}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Backup downloaded");
    } catch (caught) {
      setError(libraryErrorMessage(caught, "This backup could not be prepared on this device."));
    }
  }

  async function restoreBackup(value: unknown) {
    const nextSnapshot = await command(() => service.restoreBackup(value));
    setSnapshot(nextSnapshot);
    setNotice("Backup restored");
  }

  async function erase() {
    const nextSnapshot = await command(() => service.erase());
    setSnapshot(nextSnapshot);
    setNotice("On-device library erased");
  }

  return {
    snapshot,
    loading,
    saving,
    error,
    notice,
    pendingLegacyCovers,
    setError,
    showNotice: setNotice,
    dismissError: () => setError(""),
    saveBook,
    saveSeries,
    deleteBook,
    deleteSeries,
    downloadBackup,
    restoreBackup,
    erase,
  };
}
