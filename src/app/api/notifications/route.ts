import { NextResponse } from "next/server";
import { getSession, canAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feed for the admin notification bell. Returns recent web orders (newest
 * first) and the highest id, so the client can detect new arrivals and alert.
 */
export async function GET() {
  const user = getSession();
  if (!user || !canAccess(user.role, "web-orders")) {
    return NextResponse.json({ orders: [], maxId: 0 }, { status: 401 });
  }
  const db = getDb();
  const orders = db
    .prepare("SELECT id, number, customer_name, total, status, created_at FROM web_orders ORDER BY id DESC LIMIT 20")
    .all() as { id: number; number: string; customer_name: string; total: number; status: string; created_at: string }[];
  const maxId = orders.length ? orders[0].id : 0;
  return NextResponse.json({ orders, maxId }, { headers: { "cache-control": "no-store" } });
}
