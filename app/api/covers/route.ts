import { env } from "cloudflare:workers";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const cover = formData.get("cover");
    if (!(cover instanceof File)) {
      return Response.json({ error: "Choose a cover image first." }, { status: 400 });
    }
    if (!allowedTypes.has(cover.type)) {
      return Response.json({ error: "Use a JPG, PNG, WebP, or GIF image." }, { status: 400 });
    }
    if (cover.size > 5 * 1024 * 1024) {
      return Response.json({ error: "Cover images must be smaller than 5 MB." }, { status: 400 });
    }

    const bucket = (env as unknown as { BOOK_COVERS?: R2Bucket }).BOOK_COVERS;
    if (!bucket) throw new Error("Cover storage is unavailable.");
    const extension = cover.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const coverKey = `${crypto.randomUUID()}.${extension}`;
    await bucket.put(coverKey, await cover.arrayBuffer(), {
      httpMetadata: { contentType: cover.type, cacheControl: "public, max-age=31536000, immutable" },
    });
    return Response.json({ coverKey, coverUrl: `/api/covers/${coverKey}` }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "That cover would not upload." },
      { status: 500 },
    );
  }
}
