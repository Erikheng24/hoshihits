import { NextResponse } from "next/server";
import { forwardPaymentProof } from "@/lib/shop-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receives a payment-proof photo from the bot's "Submit payment photo" Web App
 * and forwards it to the shop's admin Telegram. The image is a downscaled data
 * URL; the order number ties it to the right order.
 */
export async function POST(req: Request) {
  let body: { order?: string; image?: string } | null = null;
  try {
    body = (await req.json()) as { order?: string; image?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const order = String(body?.order ?? "").trim();
  const image = String(body?.image ?? "");
  if (!order || !image.startsWith("data:image/") || image.length > 3_000_000) {
    return NextResponse.json({ ok: false, error: "Missing or invalid image." }, { status: 400 });
  }
  const res = await forwardPaymentProof(order, image);
  return NextResponse.json({ ok: res.ok, error: res.ok ? undefined : res.message ?? "Couldn't send." });
}
