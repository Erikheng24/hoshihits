import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, num, shortDateTime } from "@/lib/format";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SearchToolbar } from "@/components/SearchToolbar";
import { setWebOrderStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const NEXT: Record<string, { to: string; label: string }> = {
  new: { to: "contacted", label: "Mark contacted" },
  contacted: { to: "paid", label: "Mark paid" },
  paid: { to: "fulfilled", label: "Mark fulfilled" },
};

export default function WebOrdersPage({ searchParams }: { searchParams: { status?: string } }) {
  requireModule("web-orders");
  const db = getDb();

  const clauses: string[] = ["1=1"];
  const args: unknown[] = [];
  if (searchParams.status) {
    clauses.push("status = ?");
    args.push(searchParams.status);
  }
  const orders = db
    .prepare(
      `SELECT o.*, (SELECT COUNT(*) FROM web_order_items i WHERE i.order_id = o.id) item_count
       FROM web_orders o WHERE ${clauses.join(" AND ")} ORDER BY o.id DESC LIMIT 300`
    )
    .all(...args) as any[];

  const itemsByOrder = new Map<number, any[]>();
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    const items = db
      .prepare(`SELECT * FROM web_order_items WHERE order_id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids) as any[];
    for (const it of items) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id, arr);
    }
  }

  const stats = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) new_count,
        SUM(CASE WHEN status IN ('new','contacted') THEN 1 ELSE 0 END) open_count,
        COALESCE(SUM(CASE WHEN status IN ('paid','fulfilled') THEN total ELSE 0 END),0) earned
       FROM web_orders`
    )
    .get() as any;

  return (
    <>
      <PageHeader title="Web Orders" subtitle="Orders placed by customers on your public shop link." />

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5 stagger">
        <StatCard label="New" value={num(stats.new_count ?? 0)} sub="need a reply" />
        <StatCard label="Open" value={num(stats.open_count ?? 0)} sub="not yet paid" />
        <StatCard label="Earned" value={money(stats.earned)} sub="paid + fulfilled" />
      </div>

      <SearchToolbar
        placeholder="Filter…"
        filters={[{
          name: "status", label: "All statuses",
          options: ["new", "contacted", "paid", "fulfilled", "cancelled"].map((s) => ({ value: s, label: s })),
        }]}
      />

      {orders.length === 0 ? (
        <div className="card"><EmptyState icon="receipt" title="No web orders yet" hint="Share your shop link so customers can order." /></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 stagger">
          {orders.map((o) => {
            const tone =
              o.status === "new" ? "gold" : o.status === "paid" || o.status === "fulfilled" ? "green" : o.status === "cancelled" ? "red" : "blue";
            const next = NEXT[o.status];
            return (
              <div key={o.id} className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="num text-[12px] text-fog">{o.number}</p>
                    <p className="text-white font-medium">{o.customer_name}</p>
                    <p className="text-mist num text-[13px]">{o.customer_phone}</p>
                  </div>
                  <Badge tone={tone as any}>{o.status.toUpperCase()}</Badge>
                </div>

                {o.location && (
                  <p className="text-[12px] mt-2">
                    {/^https?:\/\//i.test(o.location) ? (
                      <a href={o.location} target="_blank" rel="noopener" className="text-gold-dim hover:text-gold">📍 Open delivery location</a>
                    ) : (
                      <span className="text-mist">📍 {o.location}</span>
                    )}
                  </p>
                )}
                {o.note && <p className="text-[12px] text-fog mt-2 italic">“{o.note}”</p>}

                <div className="mt-3 border-t border-dashed border-edge pt-2 space-y-1">
                  {(itemsByOrder.get(o.id) ?? []).map((it) => (
                    <div key={it.id} className="flex justify-between text-[13px]">
                      <span className="text-mist truncate pr-2">{it.qty} × {it.name}</span>
                      <span className="num text-white whitespace-nowrap">{money(it.qty * it.unit_price)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-edge/70">
                  <span className="text-fog text-[11px] whitespace-nowrap">{shortDateTime(o.created_at)}</span>
                  <span className="num text-gold-soft font-semibold">{money(o.total)}</span>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  {next && (
                    <form action={setWebOrderStatusAction} className="flex-1">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="status" value={next.to} />
                      <button className="btn-gold w-full py-2 text-[12px]"><Icon name="check" className="w-3.5 h-3.5" /> {next.label}</button>
                    </form>
                  )}
                  {o.status !== "cancelled" && o.status !== "fulfilled" && (
                    <form action={setWebOrderStatusAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <button className="btn-ghost px-3 py-2 text-[12px] text-ruby/80 hover:text-ruby">Cancel</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
