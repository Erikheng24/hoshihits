import "server-only";
import type { EnrichResult, ScanFields } from "@/lib/scan";
import { toDataUrl, demoSlab } from "./images";

/** Pull the cert number out of a scanned QR value or a typed string. */
export function certFromCode(input: string): string | null {
  // PSA QR encodes a URL like https://www.psacard.com/cert/74829105 — grab the digit run.
  const m = input.match(/(\d{7,12})/);
  return m ? m[1] : null;
}

// Per-process cache: PSA's free tier is tightly rate-limited, so never call twice for the same cert.
const cache = new Map<string, EnrichResult>();

/**
 * Look up a PSA cert.
 * - With PSA_API_TOKEN set: real PSA Public API only (never fake demo data — a wrong
 *   card label is worse than none). Rate-limits/misses return the cert + an honest note.
 * - Without a token: built-in demo data so the flow is still demonstrable.
 */
export async function lookupPsaCert(input: string): Promise<EnrichResult> {
  const cert = certFromCode(input);
  if (!cert) return { ok: false, source: "none", message: "No cert number found in the scanned code.", fields: {} };

  const token = process.env.PSA_API_TOKEN;

  if (token) {
    if (cache.has(cert)) return cache.get(cert)!;
    const r = await liveLookup(cert, token);
    const certOnly: ScanFields = { grade_company: "PSA", cert_number: cert };

    if (r.status === "ok") {
      const result: EnrichResult = { ok: true, source: "psa", fields: r.fields, image: r.image };
      cache.set(cert, result); // only cache real hits
      return result;
    }
    if (r.status === "ratelimited")
      return { ok: true, source: "none", fields: certOnly, message: "PSA daily API limit reached — cert saved. Try again later or raise your PSA API quota." };
    if (r.status === "notfound")
      return { ok: true, source: "none", fields: certOnly, message: `Cert #${cert} wasn't found on PSA (check the number, or it may be a different grader).` };
    return { ok: true, source: "none", fields: certOnly, message: "Couldn't reach PSA just now — cert saved; fill the rest in by hand." };
  }

  // ---- No token: demo mode ----
  const demo = DEMO[cert];
  if (demo) {
    return {
      ok: true,
      source: "demo",
      message: "Demo data — set PSA_API_TOKEN to pull live records + photos from PSA.",
      fields: { grade_company: "PSA", cert_number: cert, ...demo.fields },
      image: demoSlab(demo.fields.name ?? "Graded Card", demo.fields.grade ?? "10"),
    };
  }
  return {
    ok: true,
    source: "none",
    message: `Cert #${cert} captured. Add PSA_API_TOKEN to auto-fill the name, grade and slab photo.`,
    fields: { grade_company: "PSA", cert_number: cert },
  };
}

type LiveResult =
  | { status: "ok"; fields: ScanFields; image?: string }
  | { status: "ratelimited" }
  | { status: "notfound" }
  | { status: "error" };

async function liveLookup(cert: string, token: string): Promise<LiveResult> {
  try {
    const res = await fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) return { status: "ratelimited" };
    if (res.status === 404) return { status: "notfound" };
    if (!res.ok) return { status: "error" };

    const data = await res.json();
    const p = data?.PSACert ?? data;
    if (!p || !p.CertNumber) return { status: "notfound" };

    // PSA Public API fields: Subject (card name), Variety, Brand/Category (set),
    // Year, CardNumber (collector #), CardGrade / GradeDescription (grade).
    const fields: ScanFields = {
      name: [p.Subject, p.Variety].filter(Boolean).join(" ").trim() || p.Subject || undefined,
      set_name: [p.Year, p.Brand || p.Category].filter(Boolean).join(" ").trim() || undefined,
      rarity: p.CardNumber ? String(p.CardNumber).trim() : undefined,
      grade_company: "PSA",
      grade: String(p.CardGrade ?? p.GradeDescription ?? "").replace(/[^0-9.]/g, "") || undefined,
      cert_number: cert,
    };

    let image: string | undefined;
    try {
      const imgRes = await fetch(`https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${cert}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (imgRes.ok) {
        const imgs = await imgRes.json();
        const arr: any[] = Array.isArray(imgs) ? imgs : imgs?.Images ?? [];
        const front = arr.find((x) => x.IsFrontImage || /front/i.test(x.ImageURL ?? "")) ?? arr[0];
        const url = front?.ImageURL;
        if (url) image = (await toDataUrl(url)) ?? url;
      }
    } catch {
      /* images are optional and quota-limited — fine to skip */
    }

    return { status: "ok", fields, image };
  } catch {
    return { status: "error" };
  }
}

// Demo certs used ONLY when no token is configured, so the flow is demonstrable offline.
const DEMO: Record<string, { fields: ScanFields }> = {
  "74829105": { fields: { name: "Charizard ex", set_name: "Surging Sparks", grade: "10", rarity: "199/165" } },
  "49172038": { fields: { name: "Umbreon VMAX (Alt Art)", set_name: "Evolving Skies", grade: "9" } },
  "31882910": { fields: { name: "Pikachu Illustrator", set_name: "Promo", grade: "7" } },
};
