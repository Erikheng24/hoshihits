import "server-only";
import type { EnrichResult, ScanFields } from "@/lib/scan";

/**
 * Card catalog + reference market price.
 *
 * Free sources, no key strictly required:
 *  - Pokémon  → pokemontcg.io  (official art + TCGplayer market price). Optional
 *               POKEMON_TCG_API_KEY raises the rate limit considerably.
 *  - Magic    → Scryfall       (official art + USD price). No key, no signup.
 *
 * Other lines (One Piece, Yu-Gi-Oh!, Weiss, Union Arena, Digimon, Dragon Ball,
 * Gundam) have no reliable free price API — we return the name only and leave the
 * price blank rather than invent a number.
 */
export interface CatalogHit extends ScanFields {
  market_price?: number; // cents
}

const PRICED_LINES = ["Pokémon", "Magic"];

/** These public APIs intermittently return empty/error bodies — never let that throw. */
async function safeJson(res: Response): Promise<any | null> {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * pokemontcg.io returns a transient HTTP 500 on roughly half of unkeyed requests,
 * so retry a couple of times before giving up. Setting POKEMON_TCG_API_KEY makes
 * this far more reliable and is strongly recommended.
 */
async function fetchRetry(url: string, init: RequestInit, attempts = 3): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) return res; // real client error — don't retry
    } catch {
      /* network hiccup — retry */
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  return null;
}

export async function lookupCard(query: string, game?: string): Promise<EnrichResult> {
  const q = query.trim();
  if (!q) return { ok: false, source: "none", message: "Nothing to search.", fields: {} };

  try {
    if (!game || game === "Pokémon") {
      const hit = await pokemon(q);
      if (hit) return hit;
    }
    if (!game || game === "Magic") {
      const hit = await magic(q);
      if (hit) return hit;
    }
  } catch {
    /* fall through to the honest no-match path */
  }

  return {
    ok: true,
    source: "none",
    fields: { name: q },
    message: PRICED_LINES.includes(game ?? "")
      ? "No catalog match — check the spelling, or fill the details in by hand."
      : `No free price source for ${game ?? "this game"} — name kept; enter set and price manually.`,
  };
}

/** pokemontcg.io — official high-res art + TCGplayer market price. */
async function pokemon(q: string): Promise<EnrichResult | null> {
  const key = process.env.POKEMON_TCG_API_KEY;
  // The API 500s on quoted or bare queries; per-word wildcards are the reliable form.
  // e.g. "Charizard ex" -> name:Charizard* name:ex*
  const terms = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\w'-]/g, ""))
    .filter(Boolean)
    .map((w) => `name:${w}*`)
    .join(" ");
  if (!terms) return null;

  const res = await fetchRetry(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(terms)}&pageSize=1`, {
    headers: key ? { "X-Api-Key": key } : {},
  });
  if (!res || !res.ok) return null;
  const data = await safeJson(res);
  const c = data?.data?.[0];
  if (!c) return null;

  // TCGplayer market price: prefer holofoil/normal market, else any variant's market.
  const tp = c.tcgplayer?.prices ?? {};
  const variant =
    tp.holofoil ?? tp.reverseHolofoil ?? tp.normal ?? tp["1stEditionHolofoil"] ?? Object.values(tp)[0];
  const usd = (variant as any)?.market ?? (variant as any)?.mid;

  return {
    ok: true,
    source: "upc", // reuses the "matched" badge styling
    fields: {
      name: c.name,
      set_name: c.set?.name,
      rarity: c.number ? String(c.number) : c.rarity,
    },
    image: c.images?.large ?? c.images?.small,
    message: usd ? undefined : "Matched, but no market price is listed for this card.",
    marketPrice: usd ? Math.round(Number(usd) * 100) : undefined,
  };
}

/** Scryfall — official art + USD market price. */
async function magic(q: string): Promise<EnrichResult | null> {
  const res = await fetchRetry(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q)}`, {});
  if (!res || !res.ok) return null;
  const c = await safeJson(res);
  if (!c?.name) return null;
  const usd = c.prices?.usd ?? c.prices?.usd_foil;

  return {
    ok: true,
    source: "upc",
    fields: {
      name: c.name,
      set_name: c.set_name,
      rarity: c.collector_number ? String(c.collector_number) : c.rarity,
    },
    image: c.image_uris?.large ?? c.image_uris?.normal,
    marketPrice: usd ? Math.round(Number(usd) * 100) : undefined,
  };
}
