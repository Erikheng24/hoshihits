import { NextResponse } from "next/server";
import { getSession, canAccess } from "@/lib/auth";
import { getDisplayState } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Drives the customer display (the old iPhone). Returns the current KHQR to show
 * and, while a payment is pending, checks Bakong so the screen flips to "Paid"
 * the moment the money arrives.
 */
export async function GET() {
  const user = getSession();
  if (!user || !canAccess(user.role, "pos")) {
    return NextResponse.json({ idle: true, error: "unauthorized" }, { status: 401 });
  }
  try {
    const state = await getDisplayState();
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ idle: true, error: "server" }, { status: 500 });
  }
}
