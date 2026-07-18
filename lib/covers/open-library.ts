import { MAX_COVER_FILE_BYTES } from "../library/model";

const SEARCH_URL = "https://openlibrary.org/search.json";
const COVER_URL = "https://covers.openlibrary.org/b/id";
const SEARCH_ERROR = "Cover search is unavailable right now.";
const DOWNLOAD_ERROR = "That cover could not be downloaded.";

export type CoverCandidate = {
  coverId: number;
  title: string;
  author: string;
  year: number | null;
};

type SearchDocument = {
  cover_i?: unknown;
  title?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
};

type SearchParameters = {
  title?: string;
  author?: string;
  q?: string;
};

function searchUrl(parameters: SearchParameters): URL {
  const url = new URL(SEARCH_URL);
  Object.entries(parameters).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  url.searchParams.set("fields", "title,author_name,first_publish_year,cover_i");
  url.searchParams.set("limit", "12");
  return url;
}

async function searchCandidates(url: URL, fetcher: typeof fetch): Promise<CoverCandidate[]> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(SEARCH_ERROR);
  const payload = (await response.json()) as { docs?: unknown };
  const documents = Array.isArray(payload.docs) ? payload.docs as SearchDocument[] : [];
  const seen = new Set<number>();
  const candidates: CoverCandidate[] = [];
  for (const document of documents) {
    if (typeof document.cover_i !== "number" || seen.has(document.cover_i)) continue;
    seen.add(document.cover_i);
    const authors = Array.isArray(document.author_name) ? document.author_name : [];
    candidates.push({
      coverId: document.cover_i,
      title: typeof document.title === "string" ? document.title : "",
      author: typeof authors[0] === "string" ? authors[0] : "",
      year: typeof document.first_publish_year === "number" ? document.first_publish_year : null,
    });
    if (candidates.length === 12) break;
  }
  return candidates;
}

export async function searchCovers(
  { title, author }: { title: string; author: string },
  fetcher: typeof fetch = fetch,
): Promise<CoverCandidate[]> {
  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();
  const searches: SearchParameters[] = [
    { title: cleanTitle, author: cleanAuthor },
    { title: cleanTitle },
    { q: [cleanTitle, cleanAuthor].filter(Boolean).join(" ") },
  ];
  const shortTitle = cleanTitle.includes(":") ? cleanTitle.split(":", 1)[0].trim() : "";
  if (shortTitle) searches.push({ title: shortTitle, author: cleanAuthor });
  try {
    const requestedUrls = new Set<string>();
    for (const parameters of searches) {
      const url = searchUrl(parameters);
      if (requestedUrls.has(url.href)) continue;
      requestedUrls.add(url.href);
      const candidates = await searchCandidates(url, fetcher);
      if (candidates.length) return candidates;
    }
    return [];
  } catch {
    throw new Error(SEARCH_ERROR);
  }
}

export function coverImageUrl(coverId: number, size: "S" | "M" | "L"): string {
  return `${COVER_URL}/${coverId}-${size}.jpg?default=false`;
}

export async function fetchCoverDataUrl(
  coverId: number,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  try {
    let blob = await fetchCoverBlob(coverId, "L", fetcher);
    if (blob.size > MAX_COVER_FILE_BYTES) {
      blob = await fetchCoverBlob(coverId, "M", fetcher);
    }
    if (blob.size > MAX_COVER_FILE_BYTES) throw new Error(DOWNLOAD_ERROR);
    return await blobToDataUrl(blob);
  } catch {
    throw new Error(DOWNLOAD_ERROR);
  }
}

async function fetchCoverBlob(
  coverId: number,
  size: "M" | "L",
  fetcher: typeof fetch,
): Promise<Blob> {
  const response = await fetcher(coverImageUrl(coverId, size));
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/")) {
    throw new Error(DOWNLOAD_ERROR);
  }
  return response.blob();
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(DOWNLOAD_ERROR));
    reader.readAsDataURL(blob);
  });
}
