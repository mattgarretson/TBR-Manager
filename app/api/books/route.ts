import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { books, bookSeries } from "../../../db/schema";

type SeriesInput = {
  name?: string;
  status?: "complete" | "incomplete";
  nextReleaseDate?: string;
};

type BookPayload = {
  id?: string;
  libraryId?: string;
  title?: string;
  author?: string;
  reason?: string;
  tags?: string[];
  coverUrl?: string;
  coverKey?: string;
  series?: SeriesInput | null;
};

type BookRow = typeof books.$inferSelect;
type SeriesRow = typeof bookSeries.$inferSelect;
type Db = ReturnType<typeof getDb>;

function cleanTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return [
    ...new Set(
      tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function seriesSummary(row: SeriesRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status === "complete" ? "complete" : "incomplete",
    nextReleaseDate: row.nextReleaseDate,
  };
}

function toBook(row: BookRow, linkedSeries: SeriesRow | null = null) {
  let parsedTags: string[] = [];
  try {
    parsedTags = cleanTags(JSON.parse(row.tags));
  } catch {
    parsedTags = [];
  }
  return { ...row, tags: parsedTags, series: seriesSummary(linkedSeries) };
}

function validate(payload: BookPayload) {
  const libraryId = payload.libraryId?.trim() ?? "";
  const title = payload.title?.trim() ?? "";
  const author = payload.author?.trim() ?? "";
  const seriesName = payload.series?.name?.trim().replace(/\s+/g, " ") ?? "";
  const seriesStatus = payload.series?.status === "complete" ? "complete" : "incomplete";
  const requestedDate = payload.series?.nextReleaseDate?.trim() ?? "";
  const nextReleaseDate = seriesStatus === "incomplete" ? requestedDate : "";

  if (!libraryId) return { error: "libraryId is required" };
  if (!title) return { error: "Book title is required" };
  if (!author) return { error: "Author is required" };
  if (nextReleaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextReleaseDate)) {
    return { error: "Next release date must use YYYY-MM-DD" };
  }

  return {
    value: {
      libraryId,
      title,
      author,
      reason: payload.reason?.trim() ?? "",
      tags: JSON.stringify(cleanTags(payload.tags)),
      coverUrl: payload.coverUrl?.trim() ?? "",
      coverKey: payload.coverKey?.trim() ?? "",
    },
    series: seriesName
      ? {
          name: seriesName,
          nameKey: seriesName.toLowerCase(),
          status: seriesStatus,
          nextReleaseDate,
        }
      : null,
  };
}

async function resolveSeries(
  db: Db,
  libraryId: string,
  input: { name: string; nameKey: string; status: string; nextReleaseDate: string } | null,
) {
  if (!input) return null;

  const [existing] = await db
    .select()
    .from(bookSeries)
    .where(and(eq(bookSeries.libraryId, libraryId), eq(bookSeries.nameKey, input.nameKey)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(bookSeries)
      .set({
        name: input.name,
        status: input.status,
        nextReleaseDate: input.nextReleaseDate,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(bookSeries.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(bookSeries)
    .values({ id: crypto.randomUUID(), libraryId, ...input })
    .returning();
  return created;
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table") || message.includes("no such column")) {
    return "The book shelf is still being prepared. Please try again in a moment.";
  }
  return message;
}

export async function GET(request: Request) {
  try {
    const libraryId = new URL(request.url).searchParams.get("libraryId")?.trim() ?? "";
    if (!libraryId) return Response.json({ error: "libraryId is required" }, { status: 400 });

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
      books: rows.map((row) => toBook(row.book, row.series)),
      series: seriesRows.map(seriesSummary),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as BookPayload;
    const checked = validate(payload);
    if ("error" in checked) return Response.json({ error: checked.error }, { status: 400 });

    const db = getDb();
    const linkedSeries = await resolveSeries(db, checked.value.libraryId, checked.series);
    const [row] = await db
      .insert(books)
      .values({ id: crypto.randomUUID(), ...checked.value, seriesId: linkedSeries?.id ?? null })
      .returning();
    return Response.json({ book: toBook(row, linkedSeries) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as BookPayload;
    const id = payload.id?.trim() ?? "";
    if (!id) return Response.json({ error: "Book id is required" }, { status: 400 });
    const checked = validate(payload);
    if ("error" in checked) return Response.json({ error: checked.error }, { status: 400 });

    const db = getDb();
    const [existing] = await db
      .select()
      .from(books)
      .where(and(eq(books.id, id), eq(books.libraryId, checked.value.libraryId)))
      .limit(1);
    if (!existing) return Response.json({ error: "Book not found" }, { status: 404 });

    const linkedSeries = await resolveSeries(db, checked.value.libraryId, checked.series);
    const [row] = await db
      .update(books)
      .set({
        ...checked.value,
        seriesId: linkedSeries?.id ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(books.id, id), eq(books.libraryId, checked.value.libraryId)))
      .returning();

    if (existing.coverKey && existing.coverKey !== checked.value.coverKey) {
      const bindings = env as unknown as { BOOK_COVERS?: R2Bucket };
      await bindings.BOOK_COVERS?.delete(existing.coverKey);
    }
    return Response.json({ book: toBook(row, linkedSeries) });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() ?? "";
    const libraryId = url.searchParams.get("libraryId")?.trim() ?? "";
    if (!id || !libraryId) {
      return Response.json({ error: "Book id and libraryId are required" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(books)
      .where(and(eq(books.id, id), eq(books.libraryId, libraryId)))
      .limit(1);
    if (!existing) return Response.json({ error: "Book not found" }, { status: 404 });

    await db.delete(books).where(and(eq(books.id, id), eq(books.libraryId, libraryId)));
    if (existing.coverKey) {
      const bindings = env as unknown as { BOOK_COVERS?: R2Bucket };
      await bindings.BOOK_COVERS?.delete(existing.coverKey);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
