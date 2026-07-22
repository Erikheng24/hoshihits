import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money } from "@/lib/format";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SearchToolbar } from "@/components/SearchToolbar";
import { saveSupplierAction } from "./actions";

export const dynamic = "force-dynamic";

export default function SuppliersPage({ searchParams }: { searchParams: { q?: string; new?: string; edit?: string } }) {
  requireModule("suppliers");
  const db = getDb();

  const like = `%${searchParams.q ?? ""}%`;
  const suppliers = db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) po_count,
        (SELECT COALESCE(SUM(pi.qty * pi.unit_cost),0) FROM purchase_orders po JOIN po_items pi ON pi.po_id = po.id
          WHERE po.supplier_id = s.id AND po.status != 'cancelled') volume
       FROM suppliers s
       WHERE (s.name LIKE ? OR s.contact LIKE ? OR s.country LIKE ? OR s.games LIKE ?)
       ORDER BY volume DESC`
    )
    .all(like, like, like, like) as any[];

  const editing = searchParams.edit ? (db.prepare("SELECT * FROM suppliers WHERE id=?").get(Number(searchParams.edit)) as any) : null;
  const showModal = !!searchParams.new || !!editing;

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Distributors and wholesale partners."
        actions={
          <Link href="/suppliers?new=1" className="btn-gold px-4 py-2 text-sm">
            <Icon name="plus" className="w-4 h-4" /> Add supplier
          </Link>
        }
      />

      <SearchToolbar placeholder="Search supplier, country, game line…" />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
        {suppliers.map((s) => (
          <div key={s.id} className="card card-hover p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-white font-medium">{s.name}</p>
                <p className="text-[12px] text-fog mt-0.5">{s.country}</p>
              </div>
              <Link href={`/suppliers?edit=${s.id}`} className="btn-ghost w-7 h-7 !rounded-md shrink-0" title="Edit">
                <Icon name="edit" className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {(s.games ?? "").split(",").filter(Boolean).map((g: string) => (
                <Badge key={g} tone="gray">{g.trim()}</Badge>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-edge/70 text-[12px] text-fog space-y-1">
              {s.contact && <p>{s.contact}</p>}
              {s.email && <p className="num">{s.email}</p>}
              {s.phone && <p className="num">{s.phone}</p>}
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <span className="text-fog">{s.po_count} purchase orders</span>
              <span className="num text-gold-soft">{money(s.volume)} volume</span>
            </div>
          </div>
        ))}
      </div>
      {suppliers.length === 0 && <div className="card"><EmptyState icon="supplier" title="No suppliers found" /></div>}

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <Link href="/suppliers" className="absolute inset-0 bg-black/75 animate-fadein" aria-label="Close" />
          <div className="relative card shadow-pop w-full max-w-md p-6 animate-rise">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">{editing ? "Edit Supplier" : "New Supplier"}</h2>
              <Link href="/suppliers" className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></Link>
            </div>
            <form action={saveSupplierAction} className="space-y-4">
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <label className="field"><span>Company name *</span><input name="name" required className="input" defaultValue={editing?.name ?? ""} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field"><span>Contact person</span><input name="contact" className="input" defaultValue={editing?.contact ?? ""} /></label>
                <label className="field"><span>Country</span><input name="country" className="input" defaultValue={editing?.country ?? ""} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="field"><span>Email</span><input name="email" type="email" className="input" defaultValue={editing?.email ?? ""} /></label>
                <label className="field"><span>Phone</span><input name="phone" className="input num" defaultValue={editing?.phone ?? ""} /></label>
              </div>
              <label className="field"><span>Game lines (comma separated)</span><input name="games" className="input" defaultValue={editing?.games ?? ""} placeholder="Pokémon, One Piece…" /></label>
              <div className="flex justify-end gap-2">
                <Link href="/suppliers" className="btn-ghost px-4 py-2 text-sm">Cancel</Link>
                <button className="btn-gold px-5 py-2 text-sm">{editing ? "Save" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
