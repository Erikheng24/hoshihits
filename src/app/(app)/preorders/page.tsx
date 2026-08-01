import Link from "next/link";
import { ReportActions } from "@/components/ReportActions";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, num, shortDate } from "@/lib/format";
import { PageHeader, StatusBadge, StatCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SearchToolbar } from "@/components/SearchToolbar";
import { GAMES } from "@/components/InventoryView";
import { PreorderForm } from "./PreorderForm";
import { advancePreorderAction, cancelPreorderAction, deletePreorderAction } from "./actions";

export const dynamic = "force-dynamic";

const NEXT_LABEL: Record<string, string> = { pending: "Mark arrived", arrived: "Mark ready", ready: "Mark collected" };

export default function PreordersPage({ searchParams }: { searchParams: { q?: string; status?: string; new?: string } }) {
  requireModule("preorders");
  const db = getDb();

  const clauses: string[] = ["1=1"];
  const args: unknown[] = [];
  if (searchParams.q) {
    clauses.push("(p.product_name LIKE ? OR p.number LIKE ? OR c.name LIKE ?)");
    const like = `%${searchParams.q}%`;
    args.push(like, like, like);
  }
  if (searchParams.status) {
    clauses.push("p.status = ?");
    args.push(searchParams.status);
  }
  const rows = db
    .prepare(
      `SELECT p.*, c.name customer_name, c.phone customer_phone,
        (SELECT COUNT(*) FROM preorder_items i WHERE i.preorder_id = p.id) item_count
       FROM preorders p JOIN customers c ON c.id = p.customer_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY CASE p.status WHEN 'ready' THEN 0 WHEN 'arrived' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, p.id DESC LIMIT 300`
    )
    .all(...args) as any[];

  const stats = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
        SUM(CASE WHEN status='arrived' THEN 1 ELSE 0 END) arrived,
        SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) ready,
        COALESCE(SUM(CASE WHEN status IN ('pending','arrived','ready') THEN deposit ELSE 0 END),0) deposits
       FROM preorders`
    )
    .get() as any;

  const customers = db.prepare("SELECT id, name FROM customers ORDER BY name").all() as any[];

  return (
    <>
      <PageHeader
        title="Preorders"
        subtitle="Deposits, allocations, and pickup flow."
        actions={
          <>
            <ReportActions section="preorders" />
            <Link href="/preorders?new=1" className="btn-gold px-4 py-2 text-sm">
              <Icon name="plus" className="w-4 h-4" /> New preorder
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 stagger">
        <StatCard label="Pending" value={num(stats.pending ?? 0)} sub="awaiting stock" />
        <StatCard label="Arrived" value={num(stats.arrived ?? 0)} sub="to allocate" />
        <StatCard label="Ready for Pickup" value={num(stats.ready ?? 0)} sub="notify customers" />
        <StatCard label="Deposits Held" value={money(stats.deposits)} sub="open preorders" />
      </div>

      <SearchToolbar
        placeholder="Search product, number, customer…"
        filters={[{
          name: "status", label: "All statuses",
          options: ["pending", "arrived", "ready", "collected", "cancelled"].map((s) => ({ value: s, label: s })),
        }]}
      />

      <div className="card overflow-x-auto animate-rise">
        <table className="tbl">
          <thead>
            <tr>
              <th>Number</th><th>Customer</th><th>Product</th><th className="text-center">Qty</th>
              <th className="text-right">Total</th><th className="text-right">Deposit</th><th className="text-right">Balance due</th>
              <th>ETA</th><th>Status</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const total = p.total ?? p.unit_price * p.qty;
              const open = !["collected", "cancelled"].includes(p.status);
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/preorders/receipt/${p.id}`} className="num text-gold-dim hover:text-gold text-[12px]">
                      {p.number}
                    </Link>
                  </td>
                  <td>
                    <span className="text-white">{p.customer_name}</span>
                    {p.customer_phone && <span className="block text-[11px] text-fog num">{p.customer_phone}</span>}
                  </td>
                  <td className="text-mist">
                    <div className="flex items-center gap-2.5">
                      {p.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="w-8 h-8 rounded object-cover border border-edge shrink-0" />
                      )}
                      <span>
                        {p.product_name}
                        {p.item_count > 1
                          ? <span className="block text-[11px] text-gold-dim">{p.item_count} items</span>
                          : p.game && <span className="block text-[11px] text-fog">{p.game}</span>}
                      </span>
                    </div>
                  </td>
                  <td className="num text-center text-mist">{p.qty}</td>
                  <td className="num text-right text-white">{money(total)}</td>
                  <td className="num text-right text-mist">{money(p.deposit)}</td>
                  <td className="num text-right text-gold-soft">{open ? money(total - p.deposit) : "—"}</td>
                  <td className="text-fog whitespace-nowrap">{shortDate(p.expected_date)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/preorders/receipt/${p.id}`} className="btn-ghost w-7 h-7 !rounded-md inline-flex mr-1" title="Print receipt">
                      <Icon name="receipt" className="w-3.5 h-3.5" />
                    </Link>
                    {NEXT_LABEL[p.status] && (
                      <form action={advancePreorderAction} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-ghost px-2.5 py-1.5 text-[11px]">{NEXT_LABEL[p.status]}</button>
                      </form>
                    )}
                    {open && (
                      <form action={cancelPreorderAction} className="inline ml-1">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-ghost w-7 h-7 !rounded-md text-amberish/70 hover:text-amberish" title="Cancel (keep record)">
                          <Icon name="x" className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    )}
                    <form action={deletePreorderAction} className="inline ml-1">
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn-ghost w-7 h-7 !rounded-md text-ruby/70 hover:text-ruby" title="Delete this preorder">
                        <Icon name="trash" className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState icon="preorder" title="No preorders found" />}
      </div>

      {searchParams.new && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <Link href="/preorders" className="absolute inset-0 bg-black/75 animate-fadein" aria-label="Close" />
          <div className="relative card shadow-pop w-full max-w-lg p-6 animate-rise max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">New Preorder</h2>
              <Link href="/preorders" className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></Link>
            </div>
            <PreorderForm customers={customers} games={GAMES} />
          </div>
        </div>
      )}
    </>
  );
}
