import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, shortDate } from "@/lib/format";
import { PageHeader, StatusBadge, Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { addPoItemAction, removePoItemAction, setPoStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export default function PoDetailPage({ params }: { params: { id: string } }) {
  requireModule("purchase-orders");
  const db = getDb();
  const po = db
    .prepare("SELECT po.*, s.name supplier_name, s.email supplier_email FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.id=?")
    .get(Number(params.id)) as any;
  if (!po) notFound();

  const items = db.prepare("SELECT * FROM po_items WHERE po_id=? ORDER BY id").all(po.id) as any[];
  const products = db.prepare("SELECT id, name, sku, cost FROM products WHERE active=1 ORDER BY name").all() as any[];
  const shipment = db.prepare("SELECT * FROM shipments WHERE po_id=? ORDER BY id DESC LIMIT 1").get(po.id) as any;
  const itemsTotal = items.reduce((a, i) => a + i.qty * i.unit_cost, 0);
  const editable = ["draft", "ordered"].includes(po.status);

  const nextActions: { status: string; label: string; primary?: boolean }[] =
    po.status === "draft" ? [{ status: "ordered", label: "Place order", primary: true }, { status: "cancelled", label: "Cancel PO" }]
    : po.status === "ordered" ? [{ status: "in_transit", label: "Mark shipped", primary: true }, { status: "cancelled", label: "Cancel PO" }]
    : po.status === "in_transit" ? [{ status: "received", label: "Receive all & stock in", primary: true }]
    : [];

  return (
    <>
      <PageHeader
        title={po.number}
        subtitle={`${po.supplier_name}${po.expected_date ? ` · expected ${shortDate(po.expected_date)}` : ""}`}
        actions={
          <>
            <Link href="/purchase-orders" className="btn-ghost px-3 py-2 text-sm">← All POs</Link>
            {nextActions.map((a) => (
              <form key={a.status} action={setPoStatusAction}>
                <input type="hidden" name="id" value={po.id} />
                <input type="hidden" name="status" value={a.status} />
                <button className={`${a.primary ? "btn-gold" : "btn-danger"} px-4 py-2 text-sm`}>{a.label}</button>
              </form>
            ))}
          </>
        }
      />

      <div className="flex items-center gap-3 mb-5">
        <StatusBadge status={po.status} />
        {po.notes && <p className="text-fog text-sm">{po.notes}</p>}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Order Lines" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item</th><th className="text-center">Qty</th><th className="text-right">Unit cost</th>
                  <th className="text-right">Line total</th><th className="text-center">Received</th>{editable && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="text-mist">
                      {it.name}
                      {!it.product_id && <span className="block text-[11px] text-amberish">Not linked to catalog — won't auto stock-in</span>}
                    </td>
                    <td className="num text-center text-mist">{it.qty}</td>
                    <td className="num text-right text-fog">{money(it.unit_cost)}</td>
                    <td className="num text-right text-white">{money(it.qty * it.unit_cost)}</td>
                    <td className="num text-center">
                      <span className={it.received_qty >= it.qty ? "text-jade" : "text-fog"}>{it.received_qty}/{it.qty}</span>
                    </td>
                    {editable && (
                      <td className="text-right">
                        <form action={removePoItemAction} className="inline">
                          <input type="hidden" name="item_id" value={it.id} />
                          <button className="btn-ghost w-7 h-7 !rounded-md text-ruby/70 hover:text-ruby" title="Remove">
                            <Icon name="x" className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
                <tr>
                  <td className="text-white font-medium">Total</td>
                  <td className="num text-center text-mist">{items.reduce((a, i) => a + i.qty, 0)}</td>
                  <td></td>
                  <td className="num text-right text-gold-soft font-semibold">{money(itemsTotal)}</td>
                  <td></td>
                  {editable && <td></td>}
                </tr>
              </tbody>
            </table>
          </div>

          {editable && (
            <div className="border-t border-edge px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-fog mb-2">Add line</p>
              <form action={addPoItemAction} className="grid sm:grid-cols-[1fr_90px_110px_auto] gap-2">
                <input type="hidden" name="po_id" value={po.id} />
                <div className="grid gap-2">
                  <select name="product_id" className="input">
                    <option value="">— Custom item (type name below) —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                  <input name="name" className="input" placeholder="Custom item name (if not in catalog)" />
                </div>
                <input name="qty" type="number" min="1" defaultValue={1} className="input num" placeholder="Qty" />
                <input name="unit_cost" type="number" step="0.01" min="0" required className="input num" placeholder="Unit cost $" />
                <button className="btn-gold px-4 text-sm self-start py-2"><Icon name="plus" className="w-4 h-4" /> Add</button>
              </form>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Summary" className="p-5">
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-fog">Supplier</dt><dd className="text-mist">{po.supplier_name}</dd></div>
              <div className="flex justify-between"><dt className="text-fog">Contact</dt><dd className="text-mist num">{po.supplier_email ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-fog">Created</dt><dd className="text-mist">{shortDate(po.created_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-fog">Expected</dt><dd className="text-mist">{shortDate(po.expected_date)}</dd></div>
              <div className="flex justify-between"><dt className="text-fog">Shipping</dt><dd className="text-mist num">{money(po.shipping_cost)}</dd></div>
              <div className="flex justify-between border-t border-edge pt-2"><dt className="text-fog">Landed total</dt><dd className="text-gold-soft num font-semibold">{money(itemsTotal + po.shipping_cost)}</dd></div>
            </dl>
          </Card>

          {shipment && (
            <Card title="Linked Shipment" className="p-5">
              <p className="num text-white">{shipment.reference}</p>
              <p className="text-[12px] text-fog mt-1">
                {shipment.carrier ?? "Carrier TBD"}{shipment.tracking ? ` · ${shipment.tracking}` : ""}
              </p>
              <div className="mt-2"><StatusBadge status={shipment.status} /></div>
              <Link href="/shipments" className="text-[12px] text-gold-dim hover:text-gold mt-3 inline-block">Open shipments →</Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
