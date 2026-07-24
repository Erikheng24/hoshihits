import { getDb } from "./db";

export interface ReceiptConfig {
  logoSize: number;      // px, 0 = hide the logo
  fontScale: number;     // 1 = normal
  showTagline: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showStaff: boolean;
  headerNote: string;    // extra line under the shop details
  footer: string;
}

export const RECEIPT_KEYS = [
  "receipt_logo_size",
  "receipt_font_scale",
  "receipt_show_tagline",
  "receipt_show_address",
  "receipt_show_phone",
  "receipt_show_staff",
  "receipt_header_note",
  "receipt_footer",
] as const;

const bool = (v: string | undefined, dflt: boolean) => (v === undefined || v === "" ? dflt : v === "1");
const numOr = (v: string | undefined, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

/** Layout options for both receipts, editable in Settings. */
export function getReceiptConfig(): ReceiptConfig {
  const rows = getDb()
    .prepare(`SELECT key, value FROM settings WHERE key IN (${RECEIPT_KEYS.map(() => "?").join(",")})`)
    .all(...RECEIPT_KEYS) as { key: string; value: string }[];
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string | undefined>;

  return {
    logoSize: Math.max(0, Math.min(160, numOr(m.receipt_logo_size, 56))),
    fontScale: Math.max(0.8, Math.min(2.4, numOr(m.receipt_font_scale, 1))),
    showTagline: bool(m.receipt_show_tagline, true),
    showAddress: bool(m.receipt_show_address, true),
    showPhone: bool(m.receipt_show_phone, true),
    showStaff: bool(m.receipt_show_staff, true),
    headerNote: m.receipt_header_note ?? "",
    footer: m.receipt_footer ?? "",
  };
}
