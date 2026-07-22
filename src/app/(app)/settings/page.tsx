import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { shortDateTime } from "@/lib/format";
import { PageHeader, Card, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LogoUpload } from "@/components/LogoUpload";
import { saveSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  requireModule("settings");
  const db = getDb();
  const integrations = [
    { key: "PSA", label: "PSA graded lookups", live: !!process.env.PSA_API_TOKEN, hint: "psacard.com/publicapi" },
    { key: "UPC", label: "Box barcode lookups", live: !!process.env.UPC_API_KEY, hint: "upcitemdb.com" },
  ];
  const settings = Object.fromEntries(
    (db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[]).map((s) => [s.key, s.value])
  );
  const auditRows = db
    .prepare(
      `SELECT a.*, u.name user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT 60`
    )
    .all() as any[];

  return (
    <>
      <PageHeader title="Settings" subtitle="Store profile, integrations, and audit trail." />

      <Card title="Scan Integrations" className="p-5 mb-4">
        <p className="text-[12px] text-fog mb-4">
          Graded and box scans auto-fill from these services when a key is set in <span className="num text-mist">.env.local</span> (restart after editing). Until then they use built-in demo data.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {integrations.map((i) => (
            <div key={i.key} className="flex items-center gap-3 rounded-lg border border-edge bg-panel-2 px-4 py-3">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${i.live ? "bg-jade/10 text-jade border border-jade/25" : "bg-white/5 text-fog border border-edge"}`}>
                <Icon name={i.live ? "check" : "scan"} className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{i.label}</p>
                <p className="text-[11px] text-fog num">{i.hint}</p>
              </div>
              <Badge tone={i.live ? "green" : "amber"}>{i.live ? "LIVE" : "DEMO"}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Store Profile" className="p-5">
          <form action={saveSettingsAction} className="space-y-4">
            <LogoUpload initial={settings.logo?.startsWith("data:image/") ? settings.logo : null} />
            <label className="field"><span>Store name</span><input name="store_name" className="input" defaultValue={settings.store_name ?? ""} /></label>
            <label className="field"><span>Tagline</span><input name="store_tagline" className="input" defaultValue={settings.store_tagline ?? ""} /></label>
            <label className="field"><span>Address</span><input name="store_address" className="input" defaultValue={settings.store_address ?? ""} /></label>
            <label className="field"><span>Phone</span><input name="store_phone" className="input num" defaultValue={settings.store_phone ?? ""} /></label>
            <label className="field"><span>Receipt footer</span><input name="receipt_footer" className="input" defaultValue={settings.receipt_footer ?? ""} /></label>
            <div className="flex justify-end">
              <button className="btn-gold px-5 py-2 text-sm">Save settings</button>
            </div>
          </form>
        </Card>

        <Card title="Audit Log">
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="tbl">
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>
                {auditRows.map((a) => (
                  <tr key={a.id}>
                    <td className="text-fog whitespace-nowrap">{shortDateTime(a.created_at)}</td>
                    <td className="text-mist whitespace-nowrap">{a.user_name ?? "System"}</td>
                    <td className="num text-[12px] text-gold-dim whitespace-nowrap">{a.action}</td>
                    <td className="text-fog text-[12px] max-w-[240px] truncate">{a.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
