import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { books } from "../../../db/schema";

type BookPayload = {
  id?: string;
  libraryId?: string;
  title?: string;
  author?: string;
  reason?: string;
  tags?: string[];
  coverUrl?: string;
  coverKey?: string;
};

type BookRow = typeof books.$inferSelect;

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

function toBook(row: BookRow) {
  let parsedTags: string[] = [];
  try {
    parsedTags = cleanTags(JSON.parse(row.tags));
  } catch {
    parsedTags = [];
  }
  return { ...row, tags: parsedTags };
}

function validate(payload: BookPayload) {
  const libraryId = payload.libraryId?.trim() ?? "";
  const title = payload.title?.trim() ?? "";
  const author = payload.author?.trim() ?? "";
  if (!libraryId) return { error: "libraryId is required" };
  if (!title) return { error: "Book title is required" };
  if (!author) return { error: "Author is required" };
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
  };
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return "The book shelf is still being prepared. Please try again in a moment.";
  }
  return message;
}

export async function GET(request: Request) {
  try {
    const libraryId = new URL(request.url).searchParams.get("libraryId")?.trim() ?? "";
    if (!libraryId) return Response.json({ error: "libraryId is required" }, { status: 400 });

    const rows = await getDb()
      .select()
      .from(books)
      .where(eq(books.libraryId, libraryId))
      .orderBy(desc(books.createdAt));
    return Response.json({ books: rows.map(toBook) });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as BookPayload;
    const checked = validate(payload);
    if ("error" in checked) return Response.json({ error: checked.error }, { status: 400 });

    const [row] = await getDb()
      .insert(books)
      .values({ id: crypto.randomUUID(), ...checked.value })
      .returning();
    return Response.json({ book: toBook(row) }, { status: 201 });
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

    const [row] = await db
      .update(books)
      .set({ ...checked.value, updatedAt: new Date().toISOString() })
      .where(and(eq(books.id, id), eq(books.libraryId, checked.value.libraryId)))
      .returning();

    if (existing.coverKey && existing.coverKey !== checked.value.coverKey) {
      const bindings = env as unknown as { BOOK_COVERS?: R2Bucket };
      await bindings.BOOK_COVERS?.delete(existing.coverKey);
    }
    return Response.json({ book: toBook(row) });
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
