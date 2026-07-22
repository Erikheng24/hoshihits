import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, shortDateTime } from "@/lib/format";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export default function ReceiptPage({ params }: { params: { id: string } }) {
  requireModule("pos");
  const db = getDb();
  const sale = db
    .prepare(
      `SELECT s.*, c.name customer_name, u.name cashier
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(Number(params.id)) as any;
  if (!sale) notFound();
  const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(sale.id) as any[];
  const setting = (k: string) =>
    (db.prepare("SELECT value FROM settings WHERE key=?").get(k) as { value: string } | undefined)?.value ?? "";

  return (
    <div className="max-w-sm mx-auto">
      <div className="flex items-center justify-between mb-4 no-print">
        <Link href="/pos" className="btn-ghost px-3 py-2 text-sm">← Back to POS</Link>
        <PrintButton />
      </div>

      <div className="card p-6 print-receipt">
        <div className="text-center mb-5">
          {setting("logo").startsWith("data:image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={setting("logo")} alt="" className="w-14 h-14 rounded-lg object-cover mx-auto mb-2" />
          )}
          <p className="font-display tracking-[0.14em] text-gold-grad text-lg">
            {(setting("store_name") || "HoshiHits").toUpperCase()}
          </p>
          <p className="text-[11px] text-fog mt-1">{setting("store_tagline")}</p>
          <p className="text-[11px] text-fog">{setting("store_address")}</p>
          <p className="text-[11px] text-fog">{setting("store_phone")}</p>
        </div>

        <div className="text-[12px] text-mist space-y-0.5 border-y border-dashed border-edge py-2 mb-3 num">
          <div className="flex justify-between"><span>Receipt</span><span>{sale.number}</span></div>
          <div className="flex justify-between"><span>Date</span><span>{shortDateTime(sale.created_at)}</span></div>
          <div className="flex justify-between"><span>Cashier</span><span>{sale.cashier ?? "—"}</span></div>
          {sale.customer_name && <div className="flex justify-between"><span>Customer</span><span>{sale.customer_name}</span></div>}
        </div>

        <table className="w-full text-[13px]">
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="py-1 pr-2 text-mist">
                  {it.name}
                  <span className="block text-[11px] text-fog num">{it.qty} × {money(it.unit_price)}</span>
                </td>
                <td className="py-1 text-right num text-white align-top">{money(it.qty * it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-edge mt-3 pt-2 text-[13px] space-y-1">
          <div className="flex justify-between text-mist"><span>Subtotal</span><span className="num">{money(sale.subtotal)}</span></div>
          {sale.discount > 0 && <div className="flex justify-between text-mist"><span>Discount</span><span className="num">−{money(sale.discount)}</span></div>}
          <div className="flex justify-between text-white font-semibold text-[15px]"><span>Total</span><span className="num">{money(sale.total)}</span></div>
          <div className="flex justify-between text-mist">
            <span>Paid ({sale.payment_method})</span><span className="num">{money(sale.amount_paid)}</span>
          </div>
          {sale.change_due > 0 && <div className="flex justify-between text-mist"><span>Change</span><span className="num">{money(sale.change_due)}</span></div>}
        </div>

        <p className="text-center text-[11px] text-fog mt-5">{setting("receipt_footer")}</p>
        <p className="text-center text-gold text-lg mt-1">★</p>
      </div>
    </div>
  );
}
