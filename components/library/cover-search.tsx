import { useState } from "react";
import {
  coverImageUrl,
  fetchCoverDataUrl,
  searchCovers,
  type CoverCandidate,
} from "../../lib/covers/open-library";

export type CoverSearchClient = {
  searchCovers: (input: { title: string; author: string }) => Promise<CoverCandidate[]>;
  coverImageUrl: (coverId: number, size: "S" | "M" | "L") => string;
  fetchCoverDataUrl: (coverId: number) => Promise<string>;
};

const openLibraryCoverClient: CoverSearchClient = {
  searchCovers,
  coverImageUrl,
  fetchCoverDataUrl,
};

export function CoverSearch({
  title,
  author,
  onPick,
  setError,
  clearError,
  client = openLibraryCoverClient,
}: {
  title: string;
  author: string;
  onPick: (dataUrl: string) => void | Promise<void>;
  setError: (message: string) => void;
  clearError: () => void;
  client?: CoverSearchClient;
}) {
  const [status, setStatus] = useState<"idle" | "searching" | "results" | "empty">("idle");
  const [candidates, setCandidates] = useState<CoverCandidate[]>([]);
  const [downloadingCoverId, setDownloadingCoverId] = useState<number | null>(null);
  const busy = status === "searching" || downloadingCoverId !== null;

  async function findCovers() {
    clearError();
    setStatus("searching");
    setCandidates([]);
    try {
      const results = await client.searchCovers({ title, author });
      setCandidates(results);
      setStatus(results.length ? "results" : "empty");
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Cover search is unavailable right now.");
    }
  }

  async function pickCover(coverId: number) {
    clearError();
    setDownloadingCoverId(coverId);
    try {
      await onPick(await client.fetchCoverDataUrl(coverId));
      setCandidates([]);
      setStatus("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That cover could not be downloaded.");
    } finally {
      setDownloadingCoverId(null);
    }
  }

  return (
    <div className="cover-search">
      <div className="cover-search-row">
        <button
          className="secondary-button cover-search-trigger"
          type="button"
          disabled={!title.trim() || busy}
          aria-busy={status === "searching"}
          onClick={() => void findCovers()}
        >
          {status === "searching" ? "Looking for covers…" : "Find cover online"}
        </button>
        {downloadingCoverId !== null && <span role="status">Attaching cover…</span>}
      </div>

      {status === "empty" && <p className="cover-search-message" role="status">No covers found — Open Library may not have this book. Try a shorter title, or add a photo of the cover instead.</p>}

      {status === "results" && (
        <div className="cover-search-grid" aria-label="Cover search results">
          {candidates.map((candidate) => (
            <button
              className="cover-search-result"
              type="button"
              key={candidate.coverId}
              disabled={busy}
              aria-label={`Use cover for ${candidate.title || title}`}
              aria-busy={downloadingCoverId === candidate.coverId}
              onClick={() => void pickCover(candidate.coverId)}
            >
              <img
                src={client.coverImageUrl(candidate.coverId, "M")}
                alt=""
                loading="lazy"
              />
              <span className="cover-search-caption">
                <strong>{candidate.title || title}</strong>
                {(candidate.author || candidate.year) && (
                  <small>
                    {[candidate.author, candidate.year].filter(Boolean).join(" · ")}
                  </small>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
