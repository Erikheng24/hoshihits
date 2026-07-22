import "server-only";

/** Fetch a remote image and inline it as a data URL so products stay self-contained (work offline). */
export async function toDataUrl(url: string, maxBytes = 900_000): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) return null; // too big to inline — caller keeps the URL
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** A tidy self-contained "slab" graphic used for demo lookups (no external network). */
export function demoSlab(name: string, grade: string, company = "PSA"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="440" viewBox="0 0 300 440">
    <rect width="300" height="440" rx="14" fill="#0d0d0d" stroke="#D4AF37" stroke-opacity="0.4" stroke-width="2"/>
    <rect x="18" y="16" width="264" height="70" rx="8" fill="#141414" stroke="#262626"/>
    <text x="34" y="46" fill="#D4AF37" font-family="Georgia,serif" font-size="22" font-weight="700">${company}</text>
    <text x="34" y="70" fill="#9a9a9a" font-family="Arial" font-size="12">GEM MT ${grade}</text>
    <rect x="150" y="24" width="120" height="54" rx="6" fill="#D4AF37"/>
    <text x="210" y="60" fill="#0d0d0d" text-anchor="middle" font-family="Arial" font-size="30" font-weight="800">${grade}</text>
    <rect x="30" y="104" width="240" height="300" rx="8" fill="#1c1c1c" stroke="#333"/>
    <text x="150" y="250" fill="#e8cc6d" text-anchor="middle" font-family="Georgia,serif" font-size="17" font-weight="600">
      ${escapeXml(name).slice(0, 22)}</text>
    <text x="150" y="276" fill="#6b6b6b" text-anchor="middle" font-family="Arial" font-size="11">front of slab</text>
    <text x="150" y="426" fill="#6b6b6b" text-anchor="middle" font-family="Arial" font-size="10">HoshiHits demo image</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}
