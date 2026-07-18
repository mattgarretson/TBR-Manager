export type SharedPayload = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
};

export type SharedBookDraft = {
  title: string;
  author: string;
  sourceUrl: string;
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?\]}]+$/;

function cleanUrl(value: string): string {
  const candidate = value.replace(TRAILING_URL_PUNCTUATION, "");
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export function extractUrls(value: string): string[] {
  const urls = value.match(URL_PATTERN) ?? [];
  return [...new Set(urls.map(cleanUrl).filter(Boolean))];
}

function payloadUrls(payload: SharedPayload): string[] {
  return [
    ...extractUrls(payload.url ?? ""),
    ...extractUrls(payload.text ?? ""),
    ...extractUrls(payload.title ?? ""),
  ];
}

function titleAndAuthor(value: string): Pick<SharedBookDraft, "title" | "author"> | null {
  const withoutUrls = value.replace(URL_PATTERN, " ").replace(/\s+/g, " ").trim();
  if (!withoutUrls) return null;

  const goodreads = withoutUrls.match(/^(.+?)\s+by\s+(.+?)\s*[|–—-]\s*Goodreads(?:\b.*)?$/i);
  if (goodreads) {
    return { title: goodreads[1].trim(), author: goodreads[2].trim() };
  }

  const amazon = withoutUrls.match(/^(.*?)\s+[|–—-]\s*Amazon(?:\.[a-z.]+)?(?:\b.*)?$/i);
  if (!amazon) return null;
  const product = amazon[1].replace(/^Amazon(?:\.[a-z.]+)?:\s*/i, "").trim();
  const withAuthor = product.match(/^(.+?)\s+by\s+(.+)$/i);
  return withAuthor
    ? { title: withAuthor[1].trim(), author: withAuthor[2].trim() }
    : { title: product, author: "" };
}

function decodeSlug(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {}
  const words = decoded
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_+.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words || /^[a-f0-9]{8}(?:\s[a-f0-9]{4}){3}\s[a-f0-9]{12}$/i.test(words)) return "";
  if (/[A-Z]/.test(words)) return words;
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function guessesFromUrl(sourceUrl: string): Pick<SharedBookDraft, "title" | "author"> {
  if (!sourceUrl) return { title: "", author: "" };
  const parsed = new URL(sourceUrl);
  const host = parsed.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");

  if (host === "goodreads.com" || host.endsWith(".goodreads.com")) {
    const match = parsed.pathname.match(/\/book\/show\/\d+[.-]([^/]+)/i);
    return { title: decodeSlug(match?.[1] ?? ""), author: "" };
  }

  if (host === "amazon.com" || host.endsWith(".amazon.com") || /^amazon\.[a-z.]+$/.test(host)) {
    const match = parsed.pathname.match(/^\/([^/]+)\/(?:dp|gp\/product)\//i);
    return { title: decodeSlug(match?.[1] ?? ""), author: "" };
  }

  if (host === "thestorygraph.com" || host.endsWith(".thestorygraph.com")) {
    const match = parsed.pathname.match(/\/books\/([^/]+)/i);
    return { title: decodeSlug(match?.[1] ?? ""), author: "" };
  }

  return { title: "", author: "" };
}

export function parseSharedBook(payload: SharedPayload): SharedBookDraft {
  const sourceUrl = payloadUrls(payload)[0] ?? "";
  const sharedTitle = [payload.title, payload.text]
    .filter((value): value is string => typeof value === "string")
    .map(titleAndAuthor)
    .find((value) => value !== null);
  const guesses = sharedTitle ?? guessesFromUrl(sourceUrl);
  return {
    title: guesses.title,
    author: guesses.author,
    sourceUrl,
  };
}
