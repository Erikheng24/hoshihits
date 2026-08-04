import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The `www.` host is the customer storefront's front door — visiting its root
 * lands people on the shop, not the admin login. The bare domain keeps its
 * normal behaviour (login / dashboard).
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (host.startsWith("www.") && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/shop";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
