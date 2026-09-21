import { MemoryLibraryRepository } from "../lib/library/memory-repository";
import { parseBackup } from "../lib/library/model";
import { LAST_BACKUP_AT_META } from "../lib/library/repository";
import { LibraryService } from "../lib/library/service";
import type { LibraryControllerDependencies } from "./use-library-controller";

export const DEMO_PARAM = "demo";
export const DEMO_LIBRARY_FILE = "demo-library.json";

// Demo mode runs the whole app against an in-memory repository seeded from a published
// snapshot, so IndexedDB is never opened: a visitor can rummage through a real-looking
// library, and edits disappear on reload instead of landing in anybody's actual pile.
// public/demo-library.json is a backup v1 file built by scripts/build-demo-library.mjs,
// which is why it loads through the same parseBackup as a restore.

export function isDemoLaunch(search: string = window.location.search): boolean {
  const value = new URLSearchParams(search).get(DEMO_PARAM);
  return value !== null && value !== "0" && value !== "false";
}

// Resolved against the document so one build works at a domain root or under /TBR-Manager/.
export function demoLibraryUrl(baseUri: string = document.baseURI): string {
  return new URL(DEMO_LIBRARY_FILE, baseUri).href;
}

export function demoExitHref(href: string = window.location.href): string {
  const location = new URL(href);
  location.searchParams.delete(DEMO_PARAM);
  return `${location.pathname}${location.search}${location.hash}`;
}

export async function createDemoDependencies(
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<LibraryControllerDependencies> {
  const response = await fetcher(demoLibraryUrl());
  if (!response.ok) {
    throw new Error(`The demo library could not be loaded (${response.status}).`);
  }
  const snapshot = parseBackup(await response.json(), now().toISOString());
  const repository = new MemoryLibraryRepository(snapshot);
  // A fresh backup timestamp keeps the "time to back up" nudge out of the demo, where there
  // is nothing worth backing up and no way to do it.
  await repository.writeMeta(LAST_BACKUP_AT_META, now().toISOString());
  return { repository, service: new LibraryService(repository, { now }) };
}
