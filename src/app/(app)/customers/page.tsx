import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { money, shortDate } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SearchToolbar } from "@/components/SearchToolbar";
import { saveCustomerAction } from "./actions";

export const dynamic = "force-dynamic";

export default function CustomersPage({ searchParams }: { searchParams: { q?: string; new?: string; edit?: string } }) {
  requireModule("customers");
  const db = getDb();

  const clauses: string[] = ["1=1"];
  const args: unknown[] = [];
  if (searchParams.q) {
    clauses.push("(name LIKE ? OR phone LIKE ? OR email LIKE ?)");
    const like = `%${searchParams.q}%`;
    args.push(like, like, like);
  }
  const customers = db
    .prepare(
      `SELECT c.*,
        (SELECT COALESCE(SUM(total),0) FROM sales s WHERE s.customer_id = c.id AND s.status='completed') lifetime,
        (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status='completed') orders,
        (SELECT MAX(created_at) FROM sales s WHERE s.customer_id = c.id) last_visit
       FROM customers c WHERE ${clauses.join(" AND ")} ORDER BY lifetime DESC LIMIT 300`
    )
    .all(...args) as any[];

  const editing = searchParams.edit ? (db.prepare("SELECT * FROM customers WHERE id=?").get(Number(searchParams.edit)) as any) : null;
  const showModal = !!searchParams.new || !!editing;

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Customer directory and purchase history."
        actions={
          <Link href="/customers?new=1" className="btn-gold px-4 py-2 text-sm">
            <Icon name="plus" className="w-4 h-4" /> Add customer
          </Link>
        }
      />

      <SearchToolbar placeholder="Search name, phone, email…" />

      <div className="card overflow-x-auto animate-rise">
        <table className="tbl">
          <thead>
            <tr>
              <th>Customer</th><th>Contact</th>
              <th className="text-right">Lifetime spend</th><th>Last visit</th><th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/customers/${c.id}`} className="flex items-center gap-3 group">
                    <span className="w-8 h-8 rounded-full bg-gold/10 border border-gold/25 text-gold-soft text-[11px] font-semibold flex items-center justify-center shrink-0">
                      {c.name.split(" ").map((s: string) => s[0]).slice(0, 2).join("")}
                    </span>
                    <span className="text-white group-hover:text-gold-soft">{c.name}</span>
                  </Link>
                </td>
                <td className="text-mist">
                  {c.phone ?? "—"}
                  {c.email && <span className="block text-[11px] text-fog">{c.email}</span>}
                </td>
                <td className="num text-right text-white">{money(c.lifetime)} <span className="text-fog text-[11px]">({c.orders})</span></td>
                <td className="text-fog whitespace-nowrap">{c.last_visit ? shortDate(c.last_visit) : "—"}</td>
                <td className="text-right">
                  <Link href={`/customers?edit=${c.id}`} className="btn-ghost w-7 h-7 !rounded-md inline-flex" title="Edit">
                    <Icon name="edit" className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && <EmptyState icon="customers" title="No customers found" />}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <Link href="/customers" className="absolute inset-0 bg-black/75 animate-fadein" aria-label="Close" />
          <div className="relative card shadow-pop w-full max-w-md p-6 animate-rise">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">{editing ? "Edit Customer" : "New Customer"}</h2>
              <Link href="/customers" className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></Link>
            </div>
            <form action={saveCustomerAction} className="space-y-4">
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <input type="hidden" name="returnTo" value="/customers" />
              <label className="field"><span>Name *</span><input name="name" required className="input" defaultValue={editing?.name ?? ""} /></label>
              <label className="field"><span>Phone</span><input name="phone" className="input num" defaultValue={editing?.phone ?? ""} /></label>
              <label className="field"><span>Email</span><input name="email" type="email" className="input" defaultValue={editing?.email ?? ""} /></label>
              <label className="field"><span>Notes</span><textarea name="notes" rows={2} className="input" defaultValue={editing?.notes ?? ""} /></label>
              <div className="flex justify-end gap-2">
                <Link href="/customers" className="btn-ghost px-4 py-2 text-sm">Cancel</Link>
                <button className="btn-gold px-5 py-2 text-sm">{editing ? "Save" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
