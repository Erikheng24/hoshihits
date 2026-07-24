import Link from "next/link";
import { ReportActions } from "@/components/ReportActions";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { num, shortDate } from "@/lib/format";
import { PageHeader, StatusBadge, StatCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { advanceShipmentAction } from "../purchase-orders/actions";

export const dynamic = "force-dynamic";

const NEXT_LABEL: Record<string, string> = {
  processing: "Mark in transit",
  in_transit: "Mark at customs",
  customs: "Mark arrived",
  arrived: "Receive & stock in",
};

export default function ShipmentsPage() {
  requireModule("shipments");
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT sh.*, po.number po_number,
        (SELECT COALESCE(SUM(qty),0) FROM po_items WHERE po_id = sh.po_id) units
       FROM shipments sh LEFT JOIN purchase_orders po ON po.id = sh.po_id
       ORDER BY CASE sh.status WHEN 'arrived' THEN 0 WHEN 'customs' THEN 1 WHEN 'in_transit' THEN 2 WHEN 'processing' THEN 3 ELSE 4 END, sh.id DESC`
    )
    .all() as any[];

  const active = rows.filter((r) => r.status !== "received");

  return (
    <>
      <PageHeader
        title="Shipments"
        subtitle="International inbound freight — track from origin to shelf."
        actions={<ReportActions section="shipments" />}
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5 stagger">
        <StatCard label="Active Shipments" value={num(active.length)} sub="not yet received" />
        <StatCard label="At Customs" value={num(rows.filter((r) => r.status === "customs").length)} sub="clearing" />
        <StatCard label="Arrived" value={num(rows.filter((r) => r.status === "arrived").length)} sub="ready to receive" />
      </div>

      <div className="grid md:grid-cols-2 gap-4 stagger">
        {rows.map((s) => (
          <div key={s.id} className={`card card-hover p-5 ${s.status === "received" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="num text-white font-medium">{s.reference}</p>
                <p className="text-[12px] text-fog mt-0.5">
                  {s.origin ?? "Origin TBD"} → HoshiHits
                  {s.po_number && (
                    <> · PO <Link href={`/purchase-orders/${s.po_id}`} className="text-gold-dim hover:text-gold">{s.po_number}</Link></>
                  )}
                </p>
              </div>
              <StatusBadge status={s.status} />
            </div>

            {/* progress rail */}
            <div className="flex items-center gap-1 mt-4" aria-hidden="true">
              {["processing", "in_transit", "customs", "arrived", "received"].map((step, i) => {
                const order = ["processing", "in_transit", "customs", "arrived", "received"];
                const cur = order.indexOf(s.status);
                return (
                  <div key={step} className={`h-1 flex-1 rounded-full ${i <= cur ? "bg-gold" : "bg-edge"}`} />
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4 text-[12px] text-fog">
              <span>
                {s.carrier ?? "Carrier TBD"}
                {s.tracking && <span className="num"> · {s.tracking}</span>}
              </span>
              <span className="num">{s.units > 0 ? `${s.units} units · ` : ""}ETA {shortDate(s.eta)}</span>
            </div>

            {NEXT_LABEL[s.status] && (
              <form action={advanceShipmentAction} className="mt-4">
                <input type="hidden" name="id" value={s.id} />
                <button className={`${s.status === "arrived" ? "btn-gold" : "btn-ghost"} w-full py-2 text-sm`}>
                  {s.status === "arrived" && <Icon name="inventory" className="w-4 h-4" />}
                  {NEXT_LABEL[s.status]}
                </button>
              </form>
            )}
            {s.status === "received" && s.received_at && (
              <p className="mt-4 text-[12px] text-jade flex items-center gap-1.5"><Icon name="check" className="w-3.5 h-3.5" /> Received {shortDate(s.received_at)}</p>
            )}
          </div>
        ))}
      </div>
      {rows.length === 0 && <div className="card"><EmptyState icon="shipment" title="No shipments" /></div>}
    </>
  );
}
