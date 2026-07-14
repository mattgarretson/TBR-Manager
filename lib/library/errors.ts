export function libraryErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "This device is low on storage. Remove a large cover or download a backup before trying again.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

