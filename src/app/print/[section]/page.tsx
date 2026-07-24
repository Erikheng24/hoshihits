import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { getDb, ts } from "@/lib/db";
import { getReport, cellValue, type ReportColumn } from "@/lib/reports";
import { money, shortDate, shortDateTime } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

function render(row: Record<string, unknown>, col: ReportColumn): string {
  const raw = row[col.key];
  if (raw === null || raw === undefined || raw === "") return col.type === "money" || col.type === "int" ? "—" : "—";
  if (col.type === "money") return money(Number(raw));
  if (col.type === "int") return String(Number(raw));
  if (col.type === "date") return shortDate(String(raw));
  if (col.type === "datetime") return shortDateTime(String(raw));
  return String(raw);
}

export default function PrintReportPage({ params }: { params: { section: string } }) {
  const def = getReport(params.section);
  if (!def) notFound();
  requireModule(def.moduleKey);

  const rows = def.rows();
  const brand = getBranding();
  const setting = (k: string) =>
    (getDb().prepare("SELECT value FROM settings WHERE key=?").get(k) as { value: string } | undefined)?.value ?? "";

  const totals: Record<string, number> = {};
  for (const col of def.columns) {
    if (!col.total) continue;
    totals[col.key] = rows.reduce((sum, r) => sum + Number(r[col.key] ?? 0), 0);
  }
  const hasTotals = Object.keys(totals).length > 0 && rows.length > 0;
  const isNum = (c: ReportColumn) => c.type === "money" || c.type === "int";

  return (
    <div className="min-h-screen bg-[#f3f2ee] text-black py-6 px-3 print:bg-white print:p-0">
      <div className="max-w-[1100px] mx-auto mb-4 flex items-center justify-between gap-3 no-print">
        <a href="/dashboard" className="text-sm text-neutral-600 hover:text-black">← Back to app</a>
        <PrintButton />
      </div>

      <div className="print-sheet max-w-[1100px] mx-auto bg-white shadow-sm px-8 py-7">
        {/* Letterhead */}
        <div className="flex items-start justify-between gap-6 border-b-[3px] border-[#D4AF37] pb-4">
          <div className="flex items-center gap-3 min-w-0">
            {setting("logo").startsWith("data:image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={setting("logo")} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-[22px] font-semibold tracking-[0.06em] leading-tight">{brand.name.toUpperCase()}</p>
              {brand.tagline && <p className="text-[12px] text-neutral-500">{brand.tagline}</p>}
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {[setting("store_address"), setting("store_phone")].filter(Boolean).join("  ·  ")}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[17px] font-semibold">{def.title}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Generated {ts().slice(0, 16)}</p>
            <p className="text-[11px] text-neutral-500">{rows.length} record{rows.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <p className="text-center text-neutral-500 text-sm py-16">Nothing to report yet.</p>
        ) : (
          <table className="w-full mt-5 border-collapse text-[11.5px]">
            <thead>
              <tr>
                {def.columns.map((c) => (
                  <th
                    key={c.key}
                    className={`bg-[#1a1a1a] text-white font-semibold px-2.5 py-2 border-b-2 border-[#D4AF37] ${isNum(c) ? "text-right" : "text-left"}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={i % 2 ? "bg-[#faf8f2]" : ""}>
                  {def.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2.5 py-1.5 border-b border-[#e6e1d2] align-top ${isNum(c) ? "text-right whitespace-nowrap num" : ""}`}
                    >
                      {render(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {hasTotals && (
              <tfoot>
                <tr>
                  {def.columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={`px-2.5 py-2 font-semibold bg-[#f2ecd9] border-t-2 border-[#D4AF37] ${isNum(c) ? "text-right num" : ""}`}
                    >
                      {i === 0 ? "TOTAL" : c.total ? (c.type === "money" ? money(totals[c.key]) : String(totals[c.key])) : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        )}

        <p className="text-[10px] text-neutral-400 mt-6 pt-3 border-t border-neutral-200">
          {brand.name} · {def.title} · generated {ts().slice(0, 16)}
        </p>
      </div>
    </div>
  );
}
