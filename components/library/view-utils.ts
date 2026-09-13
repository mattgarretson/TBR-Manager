export function formatDate(value: string) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

// Covers are stored as data-URL strings, so string length is a close stand-in for stored bytes.
export function storedCoverLength(books: { coverImage: string }[]) {
  return books.reduce((total, book) => total + (book.coverImage.startsWith("data:") ? book.coverImage.length : 0), 0);
}

export function formatStorageSize(length: number) {
  if (length < 1024 * 1024) return `${Math.max(1, Math.round(length / 1024))} KB`;
  return `${(length / (1024 * 1024)).toFixed(1)} MB`;
}

export function coverTone(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash % 6;
}

export function readImage(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that cover image."));
    reader.readAsDataURL(file);
  });
}

const COVER_MAX_WIDTH = 600;
const COVER_MAX_HEIGHT = 900;
const COVER_JPEG_QUALITY = 0.85;

// Re-encodes a cover as a display-sized JPEG so phone photos don't bloat IndexedDB and backups.
// Resolves null when the browser can't decode or draw the image, so callers keep the original.
async function shrinkCoverImage(source: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(source);
    const scale = Math.min(1, COVER_MAX_WIDTH / bitmap.width, COVER_MAX_HEIGHT / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    // JPEG has no transparency; paint white so transparent PNG covers don't turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", COVER_JPEG_QUALITY);
    return dataUrl.startsWith("data:image/jpeg") ? dataUrl : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

export async function readCoverImage(file: Blob): Promise<string> {
  const shrunk = await shrinkCoverImage(file);
  // An image that is already small can grow when re-encoded, so keep whichever is smaller.
  if (shrunk && shrunk.length < file.size * 4 / 3) return shrunk;
  return readImage(file);
}

export async function shrinkCoverDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:") || typeof createImageBitmap !== "function") return dataUrl;
  try {
    const shrunk = await shrinkCoverImage(await (await fetch(dataUrl)).blob());
    return shrunk && shrunk.length < dataUrl.length ? shrunk : dataUrl;
  } catch {
    return dataUrl;
  }
}

