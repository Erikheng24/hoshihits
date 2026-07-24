import Link from "next/link";
import { ReportActions } from "@/components/ReportActions";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, num } from "@/lib/format";
import { PageHeader, StatCard, Card } from "@/components/ui";
import { LineChart, BarChart } from "@/components/charts";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export default function ReportsPage({ searchParams }: { searchParams: { days?: string } }) {
  requireModule("reports");
  const db = getDb();
  const days = RANGES.some((r) => r.days === Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const since = `date('now','localtime','-${days - 1} day')`;

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) revenue, COALESCE(SUM(total-cost_total),0) profit,
              COUNT(*) orders, COALESCE(SUM(discount),0) discounts
       FROM sales WHERE status='completed' AND date(created_at) >= ${since}`
    )
    .get() as any;

  const daily = db
    .prepare(
      `SELECT date(created_at) day, SUM(total) revenue, SUM(total-cost_total) profit
       FROM sales WHERE status='completed' AND date(created_at) >= ${since}
       GROUP BY day ORDER BY day`
    )
    .all() as { day: string; revenue: number; profit: number }[];

  const byGame = db
    .prepare(
      `SELECT COALESCE(p.game,'Other') game, SUM(si.qty * si.unit_price) revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE s.status='completed' AND date(s.created_at) >= ${since}
       GROUP BY p.game ORDER BY revenue DESC LIMIT 10`
    )
    .all() as { game: string; revenue: number }[];

  const byCategory = db
    .prepare(
      `SELECT COALESCE(p.category,'other') category, SUM(si.qty * si.unit_price) revenue, SUM(si.qty) units
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE s.status='completed' AND date(s.created_at) >= ${since}
       GROUP BY p.category ORDER BY revenue DESC`
    )
    .all() as { category: string; revenue: number; units: number }[];

  const byPayment = db
    .prepare(
      `SELECT payment_method, COUNT(*) count, SUM(total) revenue
       FROM sales WHERE status='completed' AND date(created_at) >= ${since}
       GROUP BY payment_method ORDER BY revenue DESC`
    )
    .all() as { payment_method: string; count: number; revenue: number }[];

  const topProducts = db
    .prepare(
      `SELECT si.name, SUM(si.qty) qty, SUM(si.qty * si.unit_price) revenue,
              SUM(si.qty * (si.unit_price - si.unit_cost)) profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.status='completed' AND date(s.created_at) >= ${since}
       GROUP BY si.name ORDER BY revenue DESC LIMIT 12`
    )
    .all() as any[];

  // Movers: units sold this period vs the period immediately before it.
  const movers = db
    .prepare(
      `SELECT si.name,
              SUM(CASE WHEN date(s.created_at) >= date('now','localtime','-${days - 1} day') THEN si.qty ELSE 0 END) AS now_qty,
              SUM(CASE WHEN date(s.created_at) <  date('now','localtime','-${days - 1} day')
                        AND date(s.created_at) >= date('now','localtime','-${days * 2 - 1} day') THEN si.qty ELSE 0 END) AS prev_qty
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.status='completed' AND date(s.created_at) >= date('now','localtime','-${days * 2 - 1} day')
       GROUP BY si.name
       HAVING now_qty > 0 OR prev_qty > 0`
    )
    .all() as { name: string; now_qty: number; prev_qty: number }[];

  const scored = movers.map((m) => ({
    ...m,
    delta: m.now_qty - m.prev_qty,
    pct: m.prev_qty > 0 ? ((m.now_qty - m.prev_qty) / m.prev_qty) * 100 : m.now_qty > 0 ? 100 : 0,
  }));
  const rising = scored.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || b.pct - a.pct).slice(0, 6);
  const falling = scored.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || a.pct - b.pct).slice(0, 6);

  const dailyPts = daily.map((p) => ({
    label: new Date(p.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: p.revenue,
    value2: p.profit,
  }));
  const payTotal = byPayment.reduce((a, p) => a + p.revenue, 0) || 1;

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Sales performance, category mix, and exports."
        actions={
          <>
            <div className="flex rounded-lg border border-edge overflow-hidden">
              {RANGES.map((r) => (
                <Link
                  key={r.days}
                  href={`/reports?days=${r.days}`}
                  className={`px-3 py-2 text-[12px] ${days === r.days ? "bg-gold/12 text-gold-soft" : "text-fog hover:text-mist"}`}
                >
                  {r.label}
                </Link>
              ))}
            </div>
            <ReportActions section="sales-detail" label="Line items" />
            <ReportActions section="sales" label="Sales report" />
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
        <StatCard label={`Revenue — ${days}d`} value={money(totals.revenue)} icon="money" />
        <StatCard label="Gross Profit" value={money(totals.profit)} icon="reports" sub={totals.revenue ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}% margin` : undefined} />
        <StatCard label="Orders" value={num(totals.orders)} icon="receipt" sub={`AOV ${money(totals.orders ? Math.round(totals.revenue / totals.orders) : 0)}`} />
        <StatCard label="Discounts Given" value={money(totals.discounts)} icon="tradein" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-5">
        <Card title={`Revenue & Profit — Last ${days} Days`} className="lg:col-span-2 p-2 pb-4">
          <div className="px-3"><LineChart data={dailyPts} series1="Revenue" series2="Profit" /></div>
        </Card>
        <Card title="Revenue by Game" className="p-2 pb-4">
          <div className="px-3">
            <BarChart data={byGame.map((g) => ({ label: g.game.length > 8 ? g.game.slice(0, 7) + "…" : g.game, value: g.revenue }))} height={252} />
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        <Card title={`Trending up — vs previous ${days} days`}>
          <ul className="px-5 pb-4 space-y-2.5">
            {rising.length === 0 && <li className="text-fog text-sm py-4 text-center">Nothing rising yet.</li>}
            {rising.map((m) => (
              <li key={m.name} className="flex items-center gap-3 text-sm">
                <Icon name="arrowUp" className="w-4 h-4 text-jade shrink-0" />
                <span className="flex-1 min-w-0 truncate text-mist">{m.name}</span>
                <span className="num text-fog text-[12px] whitespace-nowrap">{m.prev_qty} → {m.now_qty}</span>
                <span className="num text-jade font-semibold w-14 text-right">+{m.delta}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Slowing down — vs previous ${days} days`}>
          <ul className="px-5 pb-4 space-y-2.5">
            {falling.length === 0 && <li className="text-fog text-sm py-4 text-center">Nothing slowing down.</li>}
            {falling.map((m) => (
              <li key={m.name} className="flex items-center gap-3 text-sm">
                <Icon name="arrowDown" className="w-4 h-4 text-ruby shrink-0" />
                <span className="flex-1 min-w-0 truncate text-mist">{m.name}</span>
                <span className="num text-fog text-[12px] whitespace-nowrap">{m.prev_qty} → {m.now_qty}</span>
                <span className="num text-ruby font-semibold w-14 text-right">{m.delta}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Category Mix">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Category</th><th className="text-right">Units</th><th className="text-right">Revenue</th></tr></thead>
              <tbody>
                {byCategory.map((c) => (
                  <tr key={c.category}>
                    <td className="text-mist capitalize">{c.category}</td>
                    <td className="num text-right text-fog">{num(c.units)}</td>
                    <td className="num text-right text-white">{money(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Payment Mix" className="p-5">
          <ul className="space-y-3">
            {byPayment.map((p) => (
              <li key={p.payment_method}>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="text-mist capitalize">{p.payment_method} <span className="text-fog">({p.count})</span></span>
                  <span className="num text-white">{money(p.revenue)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-edge overflow-hidden">
                  <div className="h-full rounded-full bg-gold/70" style={{ width: `${(p.revenue / payTotal) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Top Products" className="md:col-span-2 xl:col-span-1">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Revenue</th></tr></thead>
              <tbody>
                {topProducts.slice(0, 8).map((p) => (
                  <tr key={p.name}>
                    <td className="text-mist truncate max-w-[200px]">{p.name}</td>
                    <td className="num text-right text-fog">{p.qty}</td>
                    <td className="num text-right text-white">{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
