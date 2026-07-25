import { requireModule } from "@/lib/auth";
import { SHOP_NOW } from "@/lib/tz";
import { ReportActions } from "@/components/ReportActions";
import { getDb } from "@/lib/db";
import { money, num, shortDateTime } from "@/lib/format";
import { PageHeader, Badge, StatCard, EmptyState } from "@/components/ui";
import { TradeinClient } from "./TradeinClient";

export const dynamic = "force-dynamic";

export default function TradeinPage() {
  requireModule("tradein");
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT t.*, c.name customer_name, u.name staff,
        (SELECT COUNT(*) FROM tradein_items ti WHERE ti.tradein_id = t.id) items
       FROM tradeins t LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.id DESC LIMIT 200`
    )
    .all() as any[];

  const stats = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN date(created_at) >= date(${SHOP_NOW},'-29 day') THEN total ELSE 0 END),0) month_total,
              COUNT(*) count,
              COALESCE(SUM(total),0) all_total
       FROM tradeins`
    )
    .get() as any;

  const customers = db.prepare("SELECT id, name FROM customers ORDER BY name").all() as { id: number; name: string }[];

  return (
    <>
      <PageHeader
        title="Trade-In / Buylist"
        subtitle="Buy collections and single cards from customers for cash."
        actions={
          <>
            <ReportActions section="tradein" />
            <TradeinClient customers={customers} />
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5 stagger">
        <StatCard label="Bought — 30 Days" value={money(stats.month_total)} sub="acquisition spend" />
        <StatCard label="Total Intakes" value={num(stats.count)} />
        <StatCard label="Paid Out" value={money(stats.all_total)} sub="all time" />
      </div>

      <div className="card overflow-x-auto animate-rise">
        <table className="tbl">
          <thead>
            <tr>
              <th>Number</th><th>Type</th><th>Customer</th><th className="text-center">Cards</th>
              <th>Staff</th><th>When</th><th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="num text-fog text-[12px]">{t.number}</td>
                <td><Badge tone={t.kind === "buylist" ? "blue" : "gold"}>{t.kind === "buylist" ? "BUYLIST" : "TRADE-IN"}</Badge></td>
                <td className="text-mist">{t.customer_name ?? <span className="text-fog">Walk-in</span>}</td>
                <td className="num text-center text-mist">{t.items}</td>
                <td className="text-fog">{t.staff ?? "—"}</td>
                <td className="text-fog whitespace-nowrap">{shortDateTime(t.created_at)}</td>
                <td className="num text-right text-white">{money(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState icon="tradein" title="No intakes yet" hint="Start with a new intake." />}
      </div>
    </>
  );
}
