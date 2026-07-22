import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession, canAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function GET(req: NextRequest) {
  const user = getSession();
  if (!user || !canAccess(user.role, "reports")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));

  const rows = getDb()
    .prepare(
      `SELECT s.number, s.created_at, COALESCE(c.name,'Walk-in') customer, u.name cashier,
              si.name item, si.qty, si.unit_price/100.0 unit_price,
              (si.qty*si.unit_price)/100.0 line_total, s.payment_method, s.total/100.0 sale_total
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.status='completed' AND date(s.created_at) >= date('now','localtime','-' || ? || ' day')
       ORDER BY s.id DESC`
    )
    .all(days - 1) as Record<string, unknown>[];

  const header = ["receipt", "datetime", "customer", "cashier", "item", "qty", "unit_price", "line_total", "payment_method", "sale_total"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.number, r.created_at, r.customer, r.cashier, r.item, r.qty, r.unit_price, r.line_total, r.payment_method, r.sale_total].map(csvEscape).join(","));
  }

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hoshihits-sales-${days}d.csv"`,
    },
  });
}
