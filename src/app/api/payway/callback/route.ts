import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { pollPayment } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ABA PayWay's server-to-server push after a card payment. We don't trust the
 * body — we just use the tran_id to trigger our own signed status check (which
 * is the source of truth and commits the sale). So this only makes detection
 * faster than the client's polling; it can't be spoofed into a false sale.
 */
export async function POST(req: Request) {
  let tranId = "";
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await req.json().catch(() => ({}))) as { tran_id?: string };
      tranId = j.tran_id ?? "";
    } else {
      const form = await req.formData().catch(() => null);
      tranId = form ? String(form.get("tran_id") ?? "") : "";
    }
  } catch {
    /* ignore malformed bodies */
  }

  if (tranId) {
    const row = getDb().prepare("SELECT id FROM payments WHERE ref = ? ORDER BY id DESC LIMIT 1").get(tranId) as
      | { id: number }
      | undefined;
    if (row) await pollPayment(row.id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
