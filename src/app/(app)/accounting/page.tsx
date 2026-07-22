import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, shortDate } from "@/lib/format";
import { PageHeader, StatCard, Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { addExpenseAction, deleteExpenseAction } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["Rent", "Utilities", "Internet", "Payroll", "Marketing", "Supplies", "Equipment", "Events", "Shipping", "Other"];

export default function AccountingPage({ searchParams }: { searchParams: { new?: string } }) {
  requireModule("accounting");
  const db = getDb();

  const pl = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) month,
              SUM(total) revenue, SUM(cost_total) cogs, SUM(total - cost_total) gross
       FROM sales WHERE status='completed' AND created_at >= date('now','localtime','start of month','-3 months')
       GROUP BY month ORDER BY month DESC`
    )
    .all() as { month: string; revenue: number; cogs: number; gross: number }[];
  const expByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', date) month, SUM(amount) total
       FROM expenses WHERE date >= date('now','localtime','start of month','-3 months')
       GROUP BY month`
    )
    .all() as { month: string; total: number }[];
  const expMap = Object.fromEntries(expByMonth.map((e) => [e.month, e.total]));

  const thisMonth = pl[0] ?? { month: "", revenue: 0, cogs: 0, gross: 0 };
  const thisMonthExp = expMap[thisMonth.month] ?? 0;

  const expenses = db
    .prepare(
      `SELECT e.*, u.name user_name FROM expenses e LEFT JOIN users u ON u.id = e.user_id
       ORDER BY e.date DESC, e.id DESC LIMIT 100`
    )
    .all() as any[];

  const byCategory = db
    .prepare(
      `SELECT category, SUM(amount) total FROM expenses
       WHERE strftime('%Y-%m', date) = strftime('%Y-%m','now','localtime')
       GROUP BY category ORDER BY total DESC`
    )
    .all() as { category: string; total: number }[];
  const catMax = Math.max(1, ...byCategory.map((c) => c.total));

  return (
    <>
      <PageHeader
        title="Accounting"
        subtitle="Profit & loss, operating expenses, and financial records."
        actions={
          <Link href="/accounting?new=1" className="btn-gold px-4 py-2 text-sm">
            <Icon name="plus" className="w-4 h-4" /> Add expense
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
        <StatCard label="Revenue (Month)" value={money(thisMonth.revenue)} icon="money" />
        <StatCard label="Gross Profit" value={money(thisMonth.gross)} icon="reports" sub={`COGS ${money(thisMonth.cogs)}`} />
        <StatCard label="Expenses (Month)" value={money(thisMonthExp)} icon="accounting" />
        <StatCard
          label="Net Profit" value={money(thisMonth.gross - thisMonthExp)} icon="star"
          trend={{ dir: thisMonth.gross - thisMonthExp >= 0 ? "up" : "down", text: thisMonth.revenue ? `${(((thisMonth.gross - thisMonthExp) / thisMonth.revenue) * 100).toFixed(1)}% margin` : "—", good: thisMonth.gross - thisMonthExp >= 0 }}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-5">
        <Card title="P&L — Last 4 Months" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>Month</th><th className="text-right">Revenue</th><th className="text-right">COGS</th><th className="text-right">Gross</th><th className="text-right">Expenses</th><th className="text-right">Net</th></tr>
              </thead>
              <tbody>
                {pl.map((m) => {
                  const exp = expMap[m.month] ?? 0;
                  const net = m.gross - exp;
                  return (
                    <tr key={m.month}>
                      <td className="text-mist">{new Date(m.month + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</td>
                      <td className="num text-right text-white">{money(m.revenue)}</td>
                      <td className="num text-right text-fog">{money(m.cogs)}</td>
                      <td className="num text-right text-mist">{money(m.gross)}</td>
                      <td className="num text-right text-fog">{money(exp)}</td>
                      <td className={`num text-right font-semibold ${net >= 0 ? "text-jade" : "text-ruby"}`}>{money(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Expenses by Category — This Month" className="p-5">
          <ul className="space-y-3">
            {byCategory.length === 0 && <li className="text-fog text-sm text-center py-6">No expenses this month.</li>}
            {byCategory.map((c) => (
              <li key={c.category}>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="text-mist">{c.category}</span>
                  <span className="num text-white">{money(c.total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-edge overflow-hidden">
                  <div className="h-full rounded-full bg-gold/70" style={{ width: `${(c.total / catMax) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Expense Ledger" className="mt-4">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Entered by</th><th className="text-right">Amount</th><th></th></tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="text-fog whitespace-nowrap">{shortDate(e.date)}</td>
                  <td className="text-mist">{e.category}</td>
                  <td className="text-mist">{e.description ?? "—"}</td>
                  <td className="text-fog">{e.user_name ?? "—"}</td>
                  <td className="num text-right text-white">{money(e.amount)}</td>
                  <td className="text-right">
                    <form action={deleteExpenseAction} className="inline">
                      <input type="hidden" name="id" value={e.id} />
                      <button className="btn-ghost w-7 h-7 !rounded-md text-ruby/70 hover:text-ruby" title="Delete">
                        <Icon name="trash" className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {expenses.length === 0 && <EmptyState icon="accounting" title="No expenses recorded" />}
        </div>
      </Card>

      {searchParams.new && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <Link href="/accounting" className="absolute inset-0 bg-black/75 animate-fadein" aria-label="Close" />
          <div className="relative card shadow-pop w-full max-w-md p-6 animate-rise">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">Add Expense</h2>
              <Link href="/accounting" className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></Link>
            </div>
            <form action={addExpenseAction} className="space-y-4">
              <label className="field"><span>Category *</span>
                <select name="category" required className="input">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="field"><span>Amount ($) *</span><input name="amount" type="number" step="0.01" min="0.01" required className="input num" /></label>
              <label className="field"><span>Date</span><input name="date" type="date" className="input num" /></label>
              <label className="field"><span>Description</span><input name="description" className="input" /></label>
              <div className="flex justify-end gap-2">
                <Link href="/accounting" className="btn-ghost px-4 py-2 text-sm">Cancel</Link>
                <button className="btn-gold px-5 py-2 text-sm">Record expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
