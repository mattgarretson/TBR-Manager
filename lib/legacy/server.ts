export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLegacyLibraryId(value: string) {
  return UUID_PATTERN.test(value);
}

export type LegacySeriesRow = {
  id: string;
  name: string;
  status: string;
  nextReleaseDate: string;
};

export type LegacyBookRow = {
  id: string;
  libraryId: string;
  seriesId: string | null;
  title: string;
  author: string;
  reason: string;
  tags: string;
  coverUrl: string;
  coverKey: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeLegacyTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().replace(/^#/, "").toLocaleLowerCase("en-US"))
        .filter(Boolean),
    ),
  ];
}

export function legacySeriesSummary(row: LegacySeriesRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status === "complete" ? "complete" as const : "incomplete" as const,
    nextReleaseDate: row.nextReleaseDate,
  };
}

export function legacyBookResponse(row: LegacyBookRow, linkedSeries: LegacySeriesRow | null = null) {
  let parsedTags: string[] = [];
  try {
    parsedTags = normalizeLegacyTags(JSON.parse(row.tags));
  } catch {
    parsedTags = [];
  }
  return { ...row, tags: parsedTags, series: legacySeriesSummary(linkedSeries) };
}
