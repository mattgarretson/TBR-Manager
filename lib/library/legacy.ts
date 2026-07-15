import { cleanSeriesName, normalizeTags, seriesNameKey } from "./model";
import type { LibraryRepository } from "./repository";
import type { Book, LegacyBook, LegacySeries, LibrarySnapshot, Series } from "./types";

export const LEGACY_IMPORT_META = "legacy-hosted-import-v1";
export const LEGACY_COVER_META = "legacy-cover-localization-v1";
const LIBRARY_ID_KEY = "plot-pile-library-id";
const LEGACY_COVER_PATH = "/api/covers/";

type LegacyPayload = { books?: LegacyBook[]; series?: LegacySeries[] };

export class LegacyLibraryClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async read(libraryId: string): Promise<LegacyPayload> {
    const response = await this.fetcher(`/api/books?libraryId=${encodeURIComponent(libraryId)}`);
    if (!response.ok) throw new Error("Your old shelf could not be copied yet. It will retry next time.");
    return (await response.json()) as LegacyPayload;
  }

  async localizeCover(coverUrl: string): Promise<string> {
    const response = await this.fetcher(coverUrl);
    if (!response.ok) throw new Error("A legacy cover could not be copied.");
    return blobToDataUrl(await response.blob());
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("A legacy cover could not be copied."));
    reader.readAsDataURL(blob);
  });
}

function mapLegacy(payload: LegacyPayload, now: string): LibrarySnapshot {
  const series: Series[] = (payload.series ?? []).map((item) => ({
    id: item.id,
    name: cleanSeriesName(item.name),
    nameKey: seriesNameKey(item.name),
    author: "",
    tags: [],
    status: item.status === "complete" ? "complete" : "incomplete",
    nextReleaseTitle: "",
    nextReleaseDate: item.nextReleaseDate || "",
    notes: "",
    createdAt: now,
    updatedAt: now,
  }));
  const seriesIds = new Set(series.map((item) => item.id));
  const books: Book[] = (payload.books ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    author: item.author,
    reason: item.reason,
    tags: normalizeTags(item.tags),
    coverImage: item.coverUrl || "",
    seriesId: item.seriesId && seriesIds.has(item.seriesId) ? item.seriesId : null,
    seriesPosition: "",
    releaseDate: "",
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
  }));
  return { books, series };
}

function isLegacyHostedCover(value: string) {
  try {
    return new URL(value, window.location.origin).pathname.startsWith(LEGACY_COVER_PATH);
  } catch {
    return false;
  }
}

export type LegacyMigrationResult = {
  importedBooks: number;
  localizedCovers: number;
  pendingCovers: number;
};

export async function migrateLegacyLibrary(input: {
  repository: LibraryRepository;
  storage: Storage;
  client?: LegacyLibraryClient;
  now?: () => Date;
}): Promise<LegacyMigrationResult> {
  const { repository, storage } = input;
  const client = input.client ?? new LegacyLibraryClient();
  const now = input.now ?? (() => new Date());
  let importedBooks = 0;

  if (!(await repository.readMeta(LEGACY_IMPORT_META))) {
    const libraryId = storage.getItem(LIBRARY_ID_KEY);
    if (!libraryId) {
      await repository.writeMeta(LEGACY_IMPORT_META, "no-legacy-library");
    } else {
      const snapshot = mapLegacy(await client.read(libraryId), now().toISOString());
      await repository.merge(snapshot);
      importedBooks = snapshot.books.length;
      await repository.writeMeta(LEGACY_IMPORT_META, now().toISOString());
    }
  }

  const snapshot = await repository.read();
  const legacyCovers = snapshot.books.filter((book) => isLegacyHostedCover(book.coverImage));
  let localizedCovers = 0;
  let pendingCovers = 0;
  for (const book of legacyCovers) {
    try {
      const coverImage = await client.localizeCover(book.coverImage);
      await repository.commitBook({ ...book, coverImage });
      localizedCovers += 1;
    } catch {
      pendingCovers += 1;
    }
  }

  await repository.writeMeta(
    LEGACY_COVER_META,
    JSON.stringify({
      status: pendingCovers ? "pending" : "complete",
      checkedAt: now().toISOString(),
      localizedCovers,
      pendingCovers,
    }),
  );
  return { importedBooks, localizedCovers, pendingCovers };
}
