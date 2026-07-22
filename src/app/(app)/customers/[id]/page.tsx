import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, shortDateTime, shortDate } from "@/lib/format";
import { PageHeader, Badge, StatCard, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function CustomerDetail({ params }: { params: { id: string } }) {
  requireModule("customers");
  const db = getDb();
  const c = db.prepare("SELECT * FROM customers WHERE id=?").get(Number(params.id)) as any;
  if (!c) notFound();

  const sales = db
    .prepare("SELECT id, number, total, payment_method, created_at FROM sales WHERE customer_id=? ORDER BY id DESC LIMIT 20")
    .all(c.id) as any[];
  const stats = db
    .prepare("SELECT COALESCE(SUM(total),0) lifetime, COUNT(*) orders FROM sales WHERE customer_id=? AND status='completed'")
    .get(c.id) as { lifetime: number; orders: number };
  const preorders = db
    .prepare("SELECT number, product_name, qty, status, expected_date FROM preorders WHERE customer_id=? ORDER BY id DESC LIMIT 10")
    .all(c.id) as any[];

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={`Customer since ${shortDate(c.created_at)}${c.phone ? ` · ${c.phone}` : ""}${c.email ? ` · ${c.email}` : ""}`}
        actions={<Link href={`/customers?edit=${c.id}`} className="btn-ghost px-4 py-2 text-sm">Edit profile</Link>}
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4 stagger">
        <StatCard label="Lifetime Spend" value={money(stats.lifetime)} sub={`${stats.orders} orders`} />
        <StatCard label="Orders" value={String(stats.orders)} />
        <StatCard label="Avg Order" value={money(stats.orders ? Math.round(stats.lifetime / stats.orders) : 0)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-5">
        <Card title="Purchase History" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Receipt</th><th>Payment</th><th>When</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/pos/receipt/${s.id}`} className="text-gold-dim hover:text-gold num">{s.number}</Link></td>
                    <td className="text-mist capitalize">{s.payment_method}</td>
                    <td className="text-fog">{shortDateTime(s.created_at)}</td>
                    <td className="num text-right text-white">{money(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sales.length === 0 && <p className="text-fog text-sm text-center py-8">No purchases yet.</p>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Preorders">
            <ul className="px-5 pb-4 space-y-2.5">
              {preorders.length === 0 && <li className="text-fog text-sm py-3 text-center">No preorders.</li>}
              {preorders.map((p) => (
                <li key={p.number} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-mist truncate">{p.product_name}</span>
                    <Badge tone={p.status === "ready" ? "gold" : p.status === "collected" ? "green" : p.status === "cancelled" ? "red" : "amber"}>
                      {p.status.toUpperCase()}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-fog num">{p.number} · qty {p.qty} · ETA {shortDate(p.expected_date)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {c.notes && (
            <Card title="Notes" className="p-5">
              <p className="text-sm text-mist whitespace-pre-wrap">{c.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
