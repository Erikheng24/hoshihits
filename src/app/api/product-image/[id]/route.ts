import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve a product photo as a real (cacheable) image response instead of shipping
 * the base64 data URL inside the shop's page query. This keeps the /shop query
 * tiny and fast; the browser loads + caches each thumbnail separately and lazily.
 * `?n=2` / `?n=3` serve the extra gallery photos.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const n = new URL(req.url).searchParams.get("n");
  const col = n === "2" ? "image2" : n === "3" ? "image3" : "image"; // fixed whitelist, no injection
  try {
    const row = getDb()
      .prepare(`SELECT ${col} AS img FROM products WHERE id = ? AND active = 1`)
      .get(Number(params.id)) as { img: string | null } | undefined;
    const raw = row?.img ?? "";
    const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m) {
      return new NextResponse(Buffer.from(m[2], "base64"), {
        headers: {
          "content-type": m[1],
          "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }
    if (raw && /^https:\/\//i.test(raw)) return NextResponse.redirect(raw);
  } catch {
    /* fall through to 404 */
  }
  return new NextResponse(null, { status: 404 });
}
