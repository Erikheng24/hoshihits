import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { dashboardData } from "@/lib/queries";
import { money, num, shortDateTime, pct } from "@/lib/format";
import { PageHeader, StatCard, Badge, Card, StatusBadge } from "@/components/ui";
import { LineChart, BarChart } from "@/components/charts";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

const PAY_LABEL: Record<string, string> = { cash: "Cash", card: "Card", qr: "QR Pay" };

export default function DashboardPage() {
  const user = requireModule("dashboard");
  const d = dashboardData();

  const revTrend =
    d.kpiYesterday.revenue > 0
      ? ((d.kpiToday.revenue - d.kpiYesterday.revenue) / d.kpiYesterday.revenue) * 100
      : 0;
  const aov = d.kpiToday.orders ? Math.round(d.kpiToday.revenue / d.kpiToday.orders) : 0;

  const dailyPts = d.daily.map((p) => ({
    label: new Date(p.day + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: p.revenue,
    value2: p.profit,
  }));
  const monthlyPts = d.monthly.map((m) => ({
    label: new Date(m.month + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" }),
    value: m.revenue,
  }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        subtitle={`Here's how ${getBranding().name} is performing.`}
        actions={
          <>
            <Link href="/pos" className="btn-gold px-4 py-2 text-sm"><Icon name="pos" className="w-4 h-4" /> New Sale</Link>
            <Link href="/inventory?new=1" className="btn-ghost px-4 py-2 text-sm hidden sm:inline-flex"><Icon name="plus" className="w-4 h-4" /> Add Product</Link>
            <Link href="/shipments" className="btn-ghost px-4 py-2 text-sm hidden md:inline-flex"><Icon name="shipment" className="w-4 h-4" /> Receive</Link>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 stagger">
        <StatCard
          label="Today's Sales" value={money(d.kpiToday.revenue)} icon="money"
          trend={d.kpiYesterday.revenue > 0 ? { dir: revTrend >= 0 ? "up" : "down", text: pct(revTrend), good: revTrend >= 0 } : undefined}
          sub="vs yesterday"
        />
        <StatCard label="Today's Profit" value={money(d.kpiToday.profit)} icon="reports" sub={`${num(d.kpiToday.orders)} orders`} />
        <StatCard label="Avg Order Value" value={money(aov)} icon="receipt" sub={`${num(d.kpiToday.customers)} customers today`} />
        <StatCard label="Inventory Value" value={money(d.inventory.value)} icon="inventory" sub={`${num(d.inventory.units)} units · retail ${money(d.inventory.retail)}`} href="/inventory" />
      </div>

      {/* Ops row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-3 sm:mt-4 stagger">
        <StatCard label="Pending Preorders" value={num(d.pendingPreorders.c)} sub={`${money(d.pendingPreorders.deposits)} in deposits`} href="/preorders" />
        <StatCard label="Ready for Pickup" value={num(d.readyPickup.c)} sub="notify customers" href="/preorders?status=ready" />
        <StatCard label="Incoming Shipments" value={num(d.incomingShipments.c)} sub="in transit / customs" href="/shipments" />
        <StatCard label="Expenses (Month)" value={money(d.monthExpenses.total)} sub="operating costs" href="/accounting" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Card title="Revenue & Profit — Last 30 Days" className="lg:col-span-2 p-2 pb-4 animate-rise">
          <div className="px-3">
            <LineChart data={dailyPts} series1="Revenue" series2="Profit" />
          </div>
        </Card>
        <Card title="Monthly Revenue" className="p-2 pb-4 animate-rise">
          <div className="px-3">
            <BarChart data={monthlyPts} height={252} />
          </div>
        </Card>
      </div>

      {/* Widgets */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        <Card title="Best Sellers — 30 Days" action={<Link href="/reports" className="text-[12px] text-gold-dim hover:text-gold">View report →</Link>}>
          <ul className="px-5 pb-4 space-y-2.5">
            {d.bestSellers.map((b, i) => (
              <li key={b.name} className="flex items-center gap-3 text-sm">
                <span className="num w-5 text-fog text-[12px]">{i + 1}</span>
                <span className="flex-1 truncate text-mist">{b.name}</span>
                <span className="num text-fog text-[12px]">×{b.qty}</span>
                <span className="num text-white w-20 text-right">{money(b.revenue)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Top Customers — 30 Days" action={<Link href="/customers" className="text-[12px] text-gold-dim hover:text-gold">All customers →</Link>}>
          <ul className="px-5 pb-4 space-y-2.5">
            {d.topCustomers.map((c) => (
              <li key={c.id} className="flex items-center gap-3 text-sm">
                <span className="w-7 h-7 rounded-full bg-gold/10 border border-gold/25 text-gold-soft text-[11px] font-semibold flex items-center justify-center shrink-0">
                  {c.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                </span>
                <span className="flex-1 min-w-0">
                  <Link href={`/customers/${c.id}`} className="block truncate text-mist hover:text-white">{c.name}</Link>
                  <span className="text-[11px] text-fog">{c.orders} orders</span>
                </span>
                <span className="num text-white">{money(c.spent)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Stock Alerts" action={<Badge tone={d.lowStock.length ? "red" : "green"}>{d.lowStock.length ? `${d.lowStock.length} LOW` : "ALL GOOD"}</Badge>}>
          <ul className="px-5 pb-4 space-y-2.5">
            {d.lowStock.length === 0 && <li className="text-sm text-fog py-4 text-center">No items below threshold.</li>}
            {d.lowStock.map((p) => (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <Icon name="alert" className={`w-4 h-4 shrink-0 ${p.stock === 0 ? "text-ruby" : "text-amberish"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-mist">{p.name}</span>
                  <span className="text-[11px] text-fog">{p.game} · {p.sku}</span>
                </span>
                <span className={`num font-semibold ${p.stock === 0 ? "text-ruby" : "text-amberish"}`}>{p.stock} left</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recent Transactions" className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>Receipt</th><th>Customer</th><th>Payment</th><th>When</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {d.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/pos/receipt/${s.id}`} className="text-gold-dim hover:text-gold num">{s.number}</Link></td>
                    <td className="text-mist">{s.customer ?? <span className="text-fog">Walk-in</span>}</td>
                    <td><Badge tone={s.payment_method === "cash" ? "green" : s.payment_method === "card" ? "blue" : "gold"}>{PAY_LABEL[s.payment_method] ?? s.payment_method}</Badge></td>
                    <td className="text-fog whitespace-nowrap">{shortDateTime(s.created_at)}</td>
                    <td className="num text-right text-white">{money(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recent Activity">
          <ul className="px-5 pb-5 space-y-3">
            {d.recentActivity.map((a, i) => (
              <li key={i} className="flex gap-3 text-[13px]">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gold/70 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="text-mist">{a.action.replace(/\./g, " · ")}</span>
                  {a.details && <span className="block text-fog text-[12px] truncate">{a.details}</span>}
                  <span className="block text-[11px] text-fog/70 mt-0.5">{a.user ?? "System"} · {shortDateTime(a.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
