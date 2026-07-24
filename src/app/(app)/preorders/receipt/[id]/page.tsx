import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, shortDate, shortDateTime } from "@/lib/format";
import { ReceiptActions } from "@/components/ReceiptActions";
import { getReceiptConfig } from "@/lib/receipt-config";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  pending: "Awaiting stock",
  arrived: "Stock arrived — being allocated",
  ready: "READY FOR PICKUP",
  collected: "Collected",
  cancelled: "Cancelled",
};

export default function PreorderReceiptPage({ params }: { params: { id: string } }) {
  requireModule("preorders");
  const db = getDb();

  const p = db
    .prepare(
      `SELECT po.*, c.name customer_name, c.phone customer_phone, c.email customer_email, u.name staff
       FROM preorders po
       LEFT JOIN customers c ON c.id = po.customer_id
       LEFT JOIN users u ON u.id = po.user_id
       WHERE po.id = ?`
    )
    .get(Number(params.id)) as any;
  if (!p) notFound();

  const setting = (k: string) =>
    (db.prepare("SELECT value FROM settings WHERE key=?").get(k) as { value: string } | undefined)?.value ?? "";

  const cfg = getReceiptConfig();
  const total = p.unit_price * p.qty;
  const balance = Math.max(0, total - p.deposit);
  const open = !["collected", "cancelled"].includes(p.status);

  return (
    <div className="max-w-sm mx-auto">
      <div className="flex items-center justify-between mb-4 no-print">
        <Link href="/preorders" className="btn-ghost px-3 py-2 text-sm">← Back</Link>
        <ReceiptActions fileName={`preorder-${p.number}`} />
      </div>

      <div className="card p-6 print-receipt" style={{ fontSize: `${(13 * cfg.fontScale).toFixed(1)}px` }}>
        <div className="text-center mb-5">
          {cfg.logoSize > 0 && setting("logo").startsWith("data:image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={setting("logo")}
              alt=""
              style={{ width: cfg.logoSize, height: cfg.logoSize }}
              className="rounded-lg object-cover mx-auto mb-2"
            />
          )}
          <p className="font-display tracking-[0.14em] text-gold-grad text-[1.35em]">
            {(setting("store_name") || "HoshiHits").toUpperCase()}
          </p>
          {cfg.showTagline && <p className="text-[0.85em] text-fog mt-1">{setting("store_tagline")}</p>}
          {cfg.showAddress && <p className="text-[0.85em] text-fog">{setting("store_address")}</p>}
          {cfg.showPhone && <p className="text-[0.85em] text-fog">{setting("store_phone")}</p>}
          {cfg.headerNote && <p className="text-[0.85em] text-mist mt-1">{cfg.headerNote}</p>}
        </div>

        <p className="text-center text-[0.85em] uppercase tracking-[0.22em] text-gold border-y border-dashed border-edge py-1.5 mb-3">
          Preorder Receipt
        </p>

        <div className="text-[0.92em] text-mist space-y-0.5 mb-3 num">
          <div className="flex justify-between"><span>Preorder</span><span>{p.number}</span></div>
          <div className="flex justify-between"><span>Date</span><span>{shortDateTime(p.created_at)}</span></div>
          <div className="flex justify-between"><span>Expected</span><span>{shortDate(p.expected_date)}</span></div>
          {cfg.showStaff && <div className="flex justify-between"><span>Taken by</span><span>{p.staff ?? "—"}</span></div>}
        </div>

        <div className="border-t border-dashed border-edge pt-2 mb-3 text-[0.92em]">
          <p className="text-[0.77em] uppercase tracking-[0.16em] text-fog mb-1">Customer</p>
          <p className="text-white">{p.customer_name ?? "—"}</p>
          {p.customer_phone && <p className="text-mist num">{p.customer_phone}</p>}
          {p.customer_email && <p className="text-mist">{p.customer_email}</p>}
        </div>

        <div className="border-t border-dashed border-edge pt-2">
          <table className="w-full text-[1em]">
            <tbody>
              <tr>
                <td className="py-1 pr-2 text-mist">
                  {p.product_name}
                  {p.game && <span className="block text-[0.85em] text-fog">{p.game}</span>}
                  <span className="block text-[0.85em] text-fog num">{p.qty} × {money(p.unit_price)}</span>
                </td>
                <td className="py-1 text-right num text-white align-top">{money(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border-t border-dashed border-edge mt-3 pt-2 text-[1em] space-y-1">
          <div className="flex justify-between text-mist"><span>Order total</span><span className="num">{money(total)}</span></div>
          <div className="flex justify-between text-jade"><span>Deposit paid</span><span className="num">−{money(p.deposit)}</span></div>
          <div className="flex justify-between text-white font-semibold text-[1.15em] border-t border-edge pt-1">
            <span>{open ? "Balance due on pickup" : "Balance"}</span>
            <span className="num text-gold-soft">{money(balance)}</span>
          </div>
        </div>

        <p className={`text-center text-[0.85em] tracking-[0.14em] uppercase mt-4 py-1.5 rounded ${p.status === "ready" ? "bg-gold/15 text-gold-soft" : p.status === "cancelled" ? "bg-ruby/10 text-ruby" : "bg-white/5 text-mist"}`}>
          {STATUS_TEXT[p.status] ?? p.status}
        </p>

        {open && (
          <p className="text-center text-[0.85em] text-fog mt-4 leading-relaxed">
            Please present this receipt when collecting your order.
            {p.deposit > 0 && " Deposits are non-refundable once stock has been ordered."}
          </p>
        )}

        <p className="text-center text-[0.85em] text-fog mt-3">{setting("receipt_footer")}</p>
        <p className="text-center text-gold text-[1.35em] mt-1">★</p>
      </div>
    </div>
  );
}
