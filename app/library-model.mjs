export function normalizeTags(tags) {
  return [
    ...new Set(
      (Array.isArray(tags) ? tags : [])
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function cleanSeriesName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function seriesNameKey(value) {
  return cleanSeriesName(value).toLocaleLowerCase();
}

export function sortSeriesBooks(books) {
  return [...books].sort((left, right) => {
    const leftPosition = left.seriesPosition?.trim() ?? "";
    const rightPosition = right.seriesPosition?.trim() ?? "";
    if (leftPosition && rightPosition) {
      const compared = leftPosition.localeCompare(rightPosition, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (compared) return compared;
    } else if (leftPosition || rightPosition) {
      return leftPosition ? -1 : 1;
    }
    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}

export function nextSeriesRelease(series, books, today = new Date().toISOString().slice(0, 10)) {
  if (series.status === "complete") return null;
  const datedBooks = books
    .filter((book) => book.releaseDate && book.releaseDate >= today)
    .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate));
  if (datedBooks[0]) {
    return { title: datedBooks[0].title, date: datedBooks[0].releaseDate, source: "book" };
  }
  if (series.nextReleaseDate) {
    return {
      title: series.nextReleaseTitle || "Next book",
      date: series.nextReleaseDate,
      source: "series",
    };
  }
  return null;
}

export function createBackup(books, series, now = new Date().toISOString()) {
  return {
    app: "Plot Pile",
    version: 1,
    exportedAt: now,
    books,
    series,
  };
}

function requiredText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function parseBackup(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("That file is not a Plot Pile backup.");
  }
  if (value.app !== "Plot Pile" || value.version !== 1) {
    throw new Error("That backup version is not supported.");
  }
  if (!Array.isArray(value.books) || !Array.isArray(value.series)) {
    throw new Error("That backup is missing its books or series.");
  }

  const series = value.series.map((item) => {
    if (!item || typeof item !== "object" || !requiredText(item.id) || !requiredText(item.name)) {
      throw new Error("That backup contains an invalid series.");
    }
    const name = cleanSeriesName(item.name);
    return {
      id: item.id,
      name,
      nameKey: seriesNameKey(name),
      status: item.status === "complete" ? "complete" : "incomplete",
      nextReleaseTitle: requiredText(item.nextReleaseTitle),
      nextReleaseDate: requiredText(item.nextReleaseDate),
      notes: requiredText(item.notes),
      createdAt: requiredText(item.createdAt, new Date().toISOString()),
      updatedAt: requiredText(item.updatedAt, new Date().toISOString()),
    };
  });
  const seriesIds = new Set(series.map((item) => item.id));

  const books = value.books.map((item) => {
    if (!item || typeof item !== "object" || !requiredText(item.id) || !requiredText(item.title)) {
      throw new Error("That backup contains an invalid book.");
    }
    const seriesId = requiredText(item.seriesId);
    return {
      id: item.id,
      title: requiredText(item.title).trim(),
      author: requiredText(item.author).trim(),
      reason: requiredText(item.reason),
      tags: normalizeTags(item.tags),
      coverImage: requiredText(item.coverImage),
      seriesId: seriesId && seriesIds.has(seriesId) ? seriesId : null,
      seriesPosition: requiredText(item.seriesPosition),
      releaseDate: requiredText(item.releaseDate),
      createdAt: requiredText(item.createdAt, new Date().toISOString()),
      updatedAt: requiredText(item.updatedAt, new Date().toISOString()),
    };
  });

  return { books, series };
}
