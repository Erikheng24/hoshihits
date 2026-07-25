import { requireModule } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { shortDateTime } from "@/lib/format";
import { PageHeader, Card, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LogoUpload } from "@/components/LogoUpload";
import { KhqrTest } from "@/components/KhqrTest";
import { getReceiptConfig } from "@/lib/receipt-config";
import { saveSettingsAction, resetDataAction } from "./actions";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  requireModule("settings");
  const db = getDb();
  const rc = getReceiptConfig();
  const integrations = [
    { key: "AI", label: "Photo scanning — cards, slabs & boxes", live: !!process.env.GEMINI_API_KEY, hint: "Google Gemini · aistudio.google.com" },
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
          One AI reads every photo — raw cards, graded slabs (name, grade &amp; cert) and sealed boxes — and the photo you take is the product picture. Needs <span className="num text-mist">GEMINI_API_KEY</span> in <span className="num text-mist">.env.local</span> (restart after editing).
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

      <Card title="KHQR Payment (Bakong)" className="p-5 mb-4">
        <p className="text-[12px] text-fog mb-4">
          Take Cambodian QR payments at checkout. The customer scans a dynamic KHQR on a spare phone
          (open <a href="/display" target="_blank" className="text-gold-dim hover:text-gold underline">the customer display</a> on it),
          and once Bakong confirms payment the receipt prints and saves automatically. Get a free Bakong Open API token at{" "}
          <span className="num text-mist">api-bakong.nbc.gov.kh</span> (tokens expire — paste a fresh one here when needed).
        </p>
        <form action={saveSettingsAction} className="grid sm:grid-cols-2 gap-4">
          <label className="field"><span>Bakong Account ID *</span>
            <input name="khqr_account_id" className="input num" defaultValue={settings.khqr_account_id ?? ""} placeholder="e.g. sokheng@aclb" />
          </label>
          <label className="field"><span>Merchant name (on QR)</span>
            <input name="khqr_merchant_name" className="input" defaultValue={settings.khqr_merchant_name ?? ""} placeholder="HoshiHits" maxLength={25} />
          </label>
          <label className="field"><span>City</span>
            <input name="khqr_city" className="input" defaultValue={settings.khqr_city ?? ""} placeholder="Phnom Penh" maxLength={15} />
          </label>
          <label className="field"><span>Mobile number (optional)</span>
            <input name="khqr_phone" className="input num" defaultValue={settings.khqr_phone ?? ""} placeholder="85512345678" />
          </label>
          <label className="field sm:col-span-2"><span>Bakong API token (for auto-detecting payment)</span>
            <input name="bakong_api_token" className="input num" defaultValue={settings.bakong_api_token ?? ""} placeholder="Paste your Bakong Open API token" />
          </label>
          <div className="sm:col-span-2 flex items-center justify-between gap-3 flex-wrap">
            <Badge tone={settings.khqr_account_id ? (settings.bakong_api_token ? "green" : "amber") : "gray"}>
              {settings.khqr_account_id ? (settings.bakong_api_token ? "READY — auto-detect on" : "QR ready — add token for auto-detect") : "Not set up"}
            </Badge>
            <button className="btn-gold px-5 py-2 text-sm">Save KHQR settings</button>
          </div>
        </form>
        <div className="mt-4 pt-4 border-t border-edge/70">
          <KhqrTest />
          <p className="text-[11px] text-fog mt-2">Generates a sample $0.10 QR to check your settings. Save first, then test. Also links to <a href="/display" target="_blank" className="text-gold-dim hover:text-gold underline">the customer display</a>.</p>
        </div>
      </Card>

      <Card title="ABA PayWay (cards + QR)" className="p-5 mb-4">
        <p className="text-[12px] text-fog mb-4">
          Accept Visa/Mastercard and ABA Pay/KHQR through your ABA PayWay merchant account (settled to ABA with its dashboard).
          Enter the merchant ID and API key ABA gave you. Keep <span className="num text-mist">Sandbox</span> while testing, then switch to Live.
        </p>
        <form action={saveSettingsAction} className="grid sm:grid-cols-2 gap-4">
          <label className="field"><span>Merchant ID</span>
            <input name="payway_merchant_id" className="input num" defaultValue={settings.payway_merchant_id ?? ""} placeholder="ABA merchant ID" />
          </label>
          <label className="field"><span>API key (secret)</span>
            <input name="payway_api_key" className="input num" defaultValue={settings.payway_api_key ?? ""} placeholder="ABA PayWay API key" />
          </label>
          <label className="field"><span>Environment</span>
            <select name="payway_sandbox" className="input" defaultValue={settings.payway_sandbox ?? "1"}>
              <option value="1">Sandbox (testing)</option>
              <option value="0">Live (real payments)</option>
            </select>
          </label>
          <label className="field"><span>Use PayWay for QR too?</span>
            <select name="payway_qr" className="input" defaultValue={settings.payway_qr ?? "0"}>
              <option value="0">No — QR uses Bakong directly</option>
              <option value="1">Yes — route QR through PayWay</option>
            </select>
          </label>
          <label className="field sm:col-span-2"><span>Public site URL (for card redirects)</span>
            <input name="app_base_url" className="input num" defaultValue={settings.app_base_url ?? ""} placeholder="https://hoshihits.onrender.com" />
          </label>
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <Badge tone={settings.payway_merchant_id && settings.payway_api_key ? (settings.payway_sandbox === "0" ? "green" : "amber") : "gray"}>
              {settings.payway_merchant_id && settings.payway_api_key
                ? settings.payway_sandbox === "0" ? "LIVE — cards on" : "SANDBOX — testing"
                : "Not set up"}
            </Badge>
            <button className="btn-gold px-5 py-2 text-sm">Save PayWay settings</button>
          </div>
        </form>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Store Profile" className="p-5">
          <form action={saveSettingsAction} className="space-y-4">
            <input type="hidden" name="has_toggles" value="1" />
            <LogoUpload initial={settings.logo?.startsWith("data:image/") ? settings.logo : null} />
            <label className="field"><span>Store name</span><input name="store_name" className="input" defaultValue={settings.store_name ?? ""} /></label>
            <label className="field"><span>Tagline</span><input name="store_tagline" className="input" defaultValue={settings.store_tagline ?? ""} /></label>
            <label className="field"><span>Address</span><input name="store_address" className="input" defaultValue={settings.store_address ?? ""} /></label>
            <label className="field"><span>Phone</span><input name="store_phone" className="input num" defaultValue={settings.store_phone ?? ""} /></label>
            <label className="field"><span>Receipt footer</span><input name="receipt_footer" className="input" defaultValue={settings.receipt_footer ?? ""} /></label>

            {/* ---- Receipt layout ---- */}
            <div className="pt-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-mist mb-1">Receipt layout</p>
              <div className="gold-rule mb-3" />

              <div className="grid grid-cols-2 gap-3">
                <label className="field"><span>Logo size ({rc.logoSize}px)</span>
                  <input name="receipt_logo_size" type="range" min={0} max={160} step={4}
                         defaultValue={rc.logoSize} className="w-full accent-[#D4AF37]" />
                </label>
                <label className="field"><span>Text size (×{rc.fontScale})</span>
                  <input name="receipt_font_scale" type="range" min={0.8} max={2.4} step={0.1}
                         defaultValue={rc.fontScale} className="w-full accent-[#D4AF37]" />
                </label>
              </div>
              <p className="text-[11px] text-fog -mt-1 mb-3">
                Set logo size to 0 to hide it. Drag Text size up for bigger, bolder print on a 57&nbsp;mm receipt, then Save and reprint to see it.
              </p>

              <label className="field"><span>Extra header line (optional)</span>
                <input name="receipt_header_note" className="input" defaultValue={rc.headerNote}
                       placeholder="e.g. Facebook: HoshiHits / Tel 086 294 739" />
              </label>

              <div className="grid grid-cols-2 gap-2 mt-3">
                {[
                  ["receipt_show_tagline", "Show tagline", rc.showTagline],
                  ["receipt_show_address", "Show address", rc.showAddress],
                  ["receipt_show_phone", "Show phone", rc.showPhone],
                  ["receipt_show_staff", "Show staff name", rc.showStaff],
                ].map(([name, label, checked]) => (
                  <label key={String(name)} className="flex items-center gap-2 text-[13px] text-mist">
                    <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} className="accent-[#D4AF37]" />
                    {String(label)}
                  </label>
                ))}
              </div>
            </div>

            <label className="field pt-2"><span>Daily AI scan limit</span>
              <input name="ai_daily_limit" type="number" min={1} className="input num"
                     defaultValue={settings.ai_daily_limit ?? ""} placeholder="200" />
              <span className="text-[11px] text-fog mt-1">Shown as “scans left today” in the scanner. Match it to your Gemini plan’s daily limit.</span>
            </label>

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

      {/* ---- Danger zone: owner-only factory reset ---- */}
      <Card title="Danger Zone" className="p-5 mt-4 border-ruby/30">
        <p className="text-[13px] text-mist mb-1">
          Erase all trading data and start the shop fresh.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 my-3">
          <div className="rounded-lg border border-ruby/25 bg-ruby/[0.06] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ruby mb-1.5">Will be erased</p>
            <p className="text-[12px] text-mist leading-relaxed">
              Products · Sales &amp; receipts · Customers · Preorders · Trade-ins ·
              Suppliers · Purchase orders · Shipments · Expenses · Tournaments · Activity log
            </p>
          </div>
          <div className="rounded-lg border border-jade/25 bg-jade/[0.06] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-jade mb-1.5">Will be kept</p>
            <p className="text-[12px] text-mist leading-relaxed">
              Your staff logins &amp; passwords · Shop settings (name, logo, receipt layout,
              AI limit) · Today&apos;s AI scan count
            </p>
          </div>
        </div>
        <form action={resetDataAction} className="flex flex-wrap items-end gap-2">
          <label className="field flex-1 min-w-[220px]">
            <span>Type ERASE to confirm</span>
            <input name="confirm" className="input" placeholder="ERASE" autoComplete="off" required />
          </label>
          <button className="btn-ghost px-5 py-2.5 text-sm !border-ruby/40 !text-ruby hover:!bg-ruby/10">
            <Icon name="trash" className="w-4 h-4" /> Erase all data
          </button>
        </form>
        <p className="text-[11px] text-fog mt-2">This cannot be undone. Export any reports you want to keep first.</p>
      </Card>
    </>
  );
}
