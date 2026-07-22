import { getDb } from "./db";

export interface Branding {
  name: string;
  tagline: string;
  logo: string | null; // data URL, or null to use the built-in star mark
}

/** Store identity used by the sidebar, login screen and every receipt. */
export function getBranding(): Branding {
  const rows = getDb().prepare("SELECT key, value FROM settings WHERE key IN ('store_name','store_tagline','logo')").all() as
    { key: string; value: string }[];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    name: (map.store_name || "HoshiHits").trim(),
    tagline: (map.store_tagline || "Card Shop ERP").trim(),
    logo: map.logo && map.logo.startsWith("data:image/") ? map.logo : null,
  };
}
