import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The app/shop icon (browser tab + home-screen). Serves the logo uploaded in
 * Settings, so changing the logo there also changes the favicon and PWA icon.
 * Falls back to the built-in star mark when no logo is set.
 */
export async function GET() {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'logo'").get() as { value: string } | undefined;
    const m = (row?.value ?? "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m) {
      return new NextResponse(Buffer.from(m[2], "base64"), {
        headers: { "content-type": m[1], "cache-control": "public, max-age=300, must-revalidate" },
      });
    }
  } catch {
    /* fall through to the default */
  }
  try {
    const svg = fs.readFileSync(path.join(process.cwd(), "public", "icon.svg"));
    return new NextResponse(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=300" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
