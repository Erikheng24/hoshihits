import Link from "next/link";
import { ReportActions } from "@/components/ReportActions";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, shortDate } from "@/lib/format";
import { PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SearchToolbar } from "@/components/SearchToolbar";
import { createPoAction } from "./actions";

export const dynamic = "force-dynamic";

export default function PurchaseOrdersPage({ searchParams }: { searchParams: { q?: string; status?: string; new?: string } }) {
  requireModule("purchase-orders");
  const db = getDb();

  const clauses = ["1=1"];
  const args: unknown[] = [];
  if (searchParams.q) {
    clauses.push("(po.number LIKE ? OR s.name LIKE ? OR po.notes LIKE ?)");
    const like = `%${searchParams.q}%`;
    args.push(like, like, like);
  }
  if (searchParams.status) {
    clauses.push("po.status = ?");
    args.push(searchParams.status);
  }

  const rows = db
    .prepare(
      `SELECT po.*, s.name supplier_name,
        (SELECT COALESCE(SUM(qty * unit_cost),0) FROM po_items WHERE po_id = po.id) items_total,
        (SELECT COALESCE(SUM(qty),0) FROM po_items WHERE po_id = po.id) units
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY CASE po.status WHEN 'draft' THEN 0 WHEN 'ordered' THEN 1 WHEN 'in_transit' THEN 2 ELSE 3 END, po.id DESC`
    )
    .all(...args) as any[];

  const suppliers = db.prepare("SELECT id, name FROM suppliers ORDER BY name").all() as any[];

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Restock orders to distributors — draft, order, track, receive."
        actions={
          <>
            <ReportActions section="purchase-orders" />
            <Link href="/purchase-orders?new=1" className="btn-gold px-4 py-2 text-sm">
              <Icon name="plus" className="w-4 h-4" /> New PO
            </Link>
          </>
        }
      />

      <SearchToolbar
        placeholder="Search PO number, supplier…"
        filters={[{
          name: "status", label: "All statuses",
          options: ["draft", "ordered", "in_transit", "received", "cancelled"].map((s) => ({ value: s, label: s.replace("_", " ") })),
        }]}
      />

      <div className="card overflow-x-auto animate-rise">
        <table className="tbl">
          <thead>
            <tr>
              <th>PO</th><th>Supplier</th><th className="text-center">Units</th>
              <th className="text-right">Items total</th><th className="text-right">Shipping</th>
              <th>Expected</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((po) => (
              <tr key={po.id}>
                <td>
                  <Link href={`/purchase-orders/${po.id}`} className="text-gold-dim hover:text-gold num">{po.number}</Link>
                  {po.notes && <span className="block text-[11px] text-fog truncate max-w-[220px]">{po.notes}</span>}
                </td>
                <td className="text-mist">{po.supplier_name}</td>
                <td className="num text-center text-mist">{po.units}</td>
                <td className="num text-right text-white">{money(po.items_total)}</td>
                <td className="num text-right text-fog">{money(po.shipping_cost)}</td>
                <td className="text-fog whitespace-nowrap">{shortDate(po.expected_date)}</td>
                <td><StatusBadge status={po.status} /></td>
                <td className="text-right">
                  <Link href={`/purchase-orders/${po.id}`} className="btn-ghost w-7 h-7 !rounded-md inline-flex" title="Open">
                    <Icon name="chevronRight" className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState icon="po" title="No purchase orders found" />}
      </div>

      {searchParams.new && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <Link href="/purchase-orders" className="absolute inset-0 bg-black/75 animate-fadein" aria-label="Close" />
          <div className="relative card shadow-pop w-full max-w-md p-6 animate-rise">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">New Purchase Order</h2>
              <Link href="/purchase-orders" className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></Link>
            </div>
            <form action={createPoAction} className="space-y-4">
              <label className="field"><span>Supplier *</span>
                <select name="supplier_id" required className="input">
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Expected date</span><input name="expected_date" type="date" className="input num" /></label>
              <label className="field"><span>Notes</span><textarea name="notes" rows={2} className="input" placeholder="Allocation, wave, remarks…" /></label>
              <div className="flex justify-end gap-2">
                <Link href="/purchase-orders" className="btn-ghost px-4 py-2 text-sm">Cancel</Link>
                <button className="btn-gold px-5 py-2 text-sm">Create draft</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
