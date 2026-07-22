import "server-only";
import type { EnrichResult } from "@/lib/scan";
import { toDataUrl } from "./images";

/**
 * Look up a product by its UPC/EAN barcode. Uses UPCitemdb when UPC_API_KEY is set
 * (or its trial endpoint as a courtesy), otherwise returns demo data / just the code.
 */
export async function lookupUpc(code: string): Promise<EnrichResult> {
  const clean = code.replace(/\D/g, "");
  if (clean.length < 8) return { ok: false, source: "none", message: "That doesn't look like a barcode.", fields: {} };

  // Only hit the network when a key is configured, so an unreachable service never stalls a scan.
  if (process.env.UPC_API_KEY) {
    const live = await liveLookup(clean);
    if (live) return live;
  }

  const demo = DEMO[clean];
  if (demo) {
    return {
      ok: true,
      source: "demo",
      message: "Demo data — set UPC_API_KEY for live product lookups.",
      fields: { barcode: clean, name: demo.name, set_name: demo.set },
    };
  }

  return {
    ok: true,
    source: "none",
    message: `Barcode ${clean} captured. Add UPC_API_KEY to auto-fill the product name and photo.`,
    fields: { barcode: clean },
  };
}

async function liveLookup(code: string): Promise<EnrichResult | null> {
  const key = process.env.UPC_API_KEY!;
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/v1/lookup?upc=${code}`, {
      headers: { user_key: key, key_type: "3scale" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item?.title) return null;
    const imageUrl: string | undefined = item.images?.[0];
    const image = imageUrl ? (await toDataUrl(imageUrl)) ?? imageUrl : undefined;
    return {
      ok: true,
      source: "upc",
      fields: { barcode: code, name: String(item.title).slice(0, 80), set_name: item.brand || undefined },
      image,
    };
  } catch {
    return null;
  }
}

const DEMO: Record<string, { name: string; set?: string }> = {
  "820650559860": { name: "Surging Sparks Booster Box", set: "Pokémon" },
  "810059786291": { name: "Prismatic Evolutions Elite Trainer Box", set: "Pokémon" },
};
