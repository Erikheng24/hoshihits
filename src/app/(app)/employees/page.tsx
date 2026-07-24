import Link from "next/link";
import { ReportActions } from "@/components/ReportActions";
import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { shortDate, shortDateTime } from "@/lib/format";
import { money, num } from "@/lib/format";
import { PageHeader, Badge, Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { saveEmployeeAction, toggleEmployeeAction } from "./actions";

export const dynamic = "force-dynamic";

const ROLES = ["OWNER", "MANAGER", "CASHIER", "INVENTORY", "ACCOUNTANT"];

export default function EmployeesPage({ searchParams }: { searchParams: { new?: string; edit?: string } }) {
  const me = requireModule("employees");
  const db = getDb();

  const users = db
    .prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM sales s WHERE s.user_id = u.id AND date(s.created_at) >= date('now','localtime','-29 day')) sales_30d,
        (SELECT COALESCE(SUM(total),0) FROM sales s WHERE s.user_id = u.id AND date(s.created_at) >= date('now','localtime','-29 day')) revenue_30d,
        (SELECT MAX(created_at) FROM audit_log a WHERE a.user_id = u.id) last_action
       FROM users u ORDER BY u.active DESC, u.role`
    )
    .all() as any[];

  const editing = searchParams.edit ? users.find((u) => u.id === Number(searchParams.edit)) : null;
  const showModal = !!searchParams.new || !!editing;

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Staff accounts, roles, and access control."
        actions={
          <>
            <ReportActions section="employees" />
            <Link href="/employees?new=1" className="btn-gold px-4 py-2 text-sm">
              <Icon name="plus" className="w-4 h-4" /> Add employee
            </Link>
          </>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Employee</th><th>Role</th><th>Status</th>
                <th className="text-right">Sales — 30d</th><th className="text-right">Revenue — 30d</th>
                <th>Last active</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="text-white">{u.name}</span>
                    <span className="block text-[11px] text-fog">{u.email}</span>
                  </td>
                  <td><Badge tone={u.role === "OWNER" ? "gold" : "gray"}>{u.role}</Badge></td>
                  <td><Badge tone={u.active ? "green" : "red"}>{u.active ? "ACTIVE" : "DISABLED"}</Badge></td>
                  <td className="num text-right text-mist">{num(u.sales_30d)}</td>
                  <td className="num text-right text-white">{money(u.revenue_30d)}</td>
                  <td className="text-fog whitespace-nowrap">{u.last_action ? shortDateTime(u.last_action) : shortDate(u.created_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/employees?edit=${u.id}`} className="btn-ghost w-7 h-7 !rounded-md inline-flex mr-1" title="Edit">
                      <Icon name="edit" className="w-3.5 h-3.5" />
                    </Link>
                    {u.id !== me.id && (
                      <form action={toggleEmployeeAction} className="inline">
                        <input type="hidden" name="id" value={u.id} />
                        <button className={`btn-ghost px-2.5 py-1.5 text-[11px] ${u.active ? "text-ruby/80" : "text-jade"}`}>
                          {u.active ? "Disable" : "Enable"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <Link href="/employees" className="absolute inset-0 bg-black/75 animate-fadein" aria-label="Close" />
          <div className="relative card shadow-pop w-full max-w-md p-6 animate-rise">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">{editing ? "Edit Employee" : "New Employee"}</h2>
              <Link href="/employees" className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></Link>
            </div>
            <form action={saveEmployeeAction} className="space-y-4">
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <label className="field"><span>Full name *</span><input name="name" required className="input" defaultValue={editing?.name ?? ""} /></label>
              <label className="field"><span>Email *</span><input name="email" type="email" required className="input" defaultValue={editing?.email ?? ""} /></label>
              <label className="field"><span>Role *</span>
                <select name="role" className="input" defaultValue={editing?.role ?? "CASHIER"}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label className="field">
                <span>{editing ? "New password (leave blank to keep)" : "Password *"}</span>
                <input name="password" type="password" className="input" required={!editing} minLength={6} placeholder="min 6 characters" />
              </label>
              <div className="flex justify-end gap-2">
                <Link href="/employees" className="btn-ghost px-4 py-2 text-sm">Cancel</Link>
                <button className="btn-gold px-5 py-2 text-sm">{editing ? "Save" : "Create account"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
