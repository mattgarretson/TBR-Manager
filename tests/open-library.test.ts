import { describe, expect, it, vi } from "vitest";
import {
  coverImageUrl,
  fetchCoverDataUrl,
  searchCovers,
} from "../lib/covers/open-library";
import { MAX_COVER_FILE_BYTES } from "../lib/library/model";

function responseFetcher(response: Response): typeof fetch {
  return vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
}

describe("Open Library cover client", () => {
  it("encodes title and author queries and requests only cover result fields", async () => {
    const fetcher = responseFetcher(new Response(JSON.stringify({ docs: [] }), {
      headers: { "content-type": "application/json" },
    }));

    await searchCovers({ title: "A Book & More", author: "Writer & Co" }, fetcher);

    const requestUrl = new URL(String(vi.mocked(fetcher).mock.calls[0][0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://openlibrary.org/search.json");
    expect(requestUrl.searchParams.get("title")).toBe("A Book & More");
    expect(requestUrl.searchParams.get("author")).toBe("Writer & Co");
    expect(requestUrl.searchParams.get("fields")).toBe("title,author_name,first_publish_year,cover_i");
    expect(requestUrl.searchParams.get("limit")).toBe("12");
    expect(String(vi.mocked(fetcher).mock.calls[0][0])).toContain("title=A+Book+%26+More");
  });

  it("omits an empty author and maps, filters, and deduplicates candidates", async () => {
    const fetcher = responseFetcher(new Response(JSON.stringify({
      docs: [
        { cover_i: 42, title: "Unsouled", author_name: ["Will Wight"], first_publish_year: 2016 },
        { title: "No cover", author_name: ["Someone"] },
        { cover_i: 42, title: "Duplicate edition", author_name: ["Will Wight"] },
        { cover_i: 91, title: "Unknown details" },
      ],
    }), { headers: { "content-type": "application/json" } }));

    const results = await searchCovers({ title: "Unsouled", author: "  " }, fetcher);

    const requestUrl = new URL(String(vi.mocked(fetcher).mock.calls[0][0]));
    expect(requestUrl.searchParams.has("author")).toBe(false);
    expect(results).toEqual([
      { coverId: 42, title: "Unsouled", author: "Will Wight", year: 2016 },
      { coverId: 91, title: "Unknown details", author: "", year: null },
    ]);
  });

  it("uses friendly search errors for unavailable responses", async () => {
    const fetcher = responseFetcher(new Response("unavailable", { status: 503 }));

    await expect(searchCovers({ title: "Unsouled", author: "Will Wight" }, fetcher))
      .rejects.toThrow("Cover search is unavailable right now.");
  });

  it("builds cover URLs that return a 404 instead of a placeholder", () => {
    expect(coverImageUrl(42, "M")).toBe("https://covers.openlibrary.org/b/id/42-M.jpg?default=false");
  });

  it("downloads an image as a data URL", async () => {
    const fetcher = responseFetcher(new Response("cover", {
      headers: { "content-type": "image/jpeg" },
    }));

    await expect(fetchCoverDataUrl(42, fetcher)).resolves.toBe("data:image/jpeg;base64,Y292ZXI=");
  });

  it("rejects responses that are not images", async () => {
    const fetcher = responseFetcher(new Response("not an image", {
      headers: { "content-type": "text/html" },
    }));

    await expect(fetchCoverDataUrl(42, fetcher)).rejects.toThrow("That cover could not be downloaded.");
  });

  it("falls back to the medium image when the large cover exceeds the limit", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(
        new Uint8Array(MAX_COVER_FILE_BYTES + 1),
        { headers: { "content-type": "image/jpeg" } },
      ))
      .mockResolvedValueOnce(new Response(
        "smaller",
        { headers: { "content-type": "image/jpeg" } },
      )) as unknown as typeof fetch;

    const result = await fetchCoverDataUrl(42, fetcher);

    expect(result).toBe("data:image/jpeg;base64,c21hbGxlcg==");
    expect(vi.mocked(fetcher).mock.calls.map(([url]) => String(url))).toEqual([
      coverImageUrl(42, "L"),
      coverImageUrl(42, "M"),
    ]);
  });

  it("rejects a missing cover image", async () => {
    const fetcher = responseFetcher(new Response("missing", { status: 404 }));

    await expect(fetchCoverDataUrl(42, fetcher)).rejects.toThrow("That cover could not be downloaded.");
  });
});
