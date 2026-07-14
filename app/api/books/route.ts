import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, bookSeries } from "../../../db/schema";
import {
  legacyBookResponse,
  legacySeriesSummary,
  isLegacyLibraryId,
} from "../../../lib/legacy/server";

function legacyReadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("no such table") || message.includes("no such column")) {
    return "The old shelf is still being prepared. Please try again in a moment.";
  }
  return "The old shelf could not be read right now.";
}

export async function GET(request: Request) {
  try {
    const libraryId = new URL(request.url).searchParams.get("libraryId")?.trim() ?? "";
    if (!isLegacyLibraryId(libraryId)) {
      return Response.json({ error: "A valid legacy library id is required" }, { status: 400 });
    }

    const db = getDb();
    const [rows, seriesRows] = await Promise.all([
      db
        .select({ book: books, series: bookSeries })
        .from(books)
        .leftJoin(bookSeries, eq(books.seriesId, bookSeries.id))
        .where(eq(books.libraryId, libraryId))
        .orderBy(desc(books.createdAt)),
      db
        .select()
        .from(bookSeries)
        .where(eq(bookSeries.libraryId, libraryId)),
    ]);

    return Response.json({
      books: rows.map((row) => legacyBookResponse(row.book, row.series)),
      series: seriesRows.map(legacySeriesSummary),
    });
  } catch (error) {
    return Response.json({ error: legacyReadError(error) }, { status: 500 });
  }
}
