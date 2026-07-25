"use server";

import { requireModule } from "@/lib/auth";
import { getDb, audit, ts, getAiUsage, type AiUsage } from "@/lib/db";
import type { EnrichResult, ItemKind } from "@/lib/scan";
import { lookupPsaCert } from "@/lib/providers/psa";
import { lookupUpc } from "@/lib/providers/upc";
import { lookupCard } from "@/lib/providers/catalog";
import { identifyPhoto } from "@/lib/providers/vision";

/**
 * Turn a scanned code (or a card name) into product data.
 * - graded: PSA slab QR / typed cert number → PSA cert lookup.
 * - sealed: box or pack UPC/EAN barcode → product lookup.
 * - raw:    card name (from OCR or typed) → TCG catalog: art + set + market price.
 */
export async function enrichScan(kind: ItemKind, code: string, game?: string): Promise<EnrichResult> {
  requireModule("inventory");
  const input = (code ?? "").trim();
  if (!input) return { ok: false, source: "none", message: "Nothing scanned.", fields: {} };

  if (kind === "graded") return lookupPsaCert(input);
  if (kind === "sealed") return lookupUpc(input);
  return lookupCard(input, game);
}

/** Photo identification result, plus the game/kind the AI inferred from the image. */
export interface PhotoIdResult extends EnrichResult {
  identified: boolean;
  game?: string;
  kind?: ItemKind;
  provider?: string; // which AI answered (gemini / groq)
  usage?: AiUsage; // today's per-provider AI scan counts + daily limits
}

/**
 * Identify a card, slab or box from a photo with vision AI.
 * Reads the item exactly as printed (Japanese product stays Japanese) and returns
 * the data the AI reads. The picture is always the photo the shopkeeper took — we
 * do NOT substitute English stock art, so the record matches the real item.
 */
export async function identifyPhotoAction(dataUrl: string, gameHint?: string): Promise<PhotoIdResult> {
  requireModule("lookup");

  const vid = await identifyPhoto(dataUrl, gameHint);
  const usage = getAiUsage();
  if (!vid.identified || !vid.fields.name) {
    return { ok: vid.ok, identified: false, source: "none", message: vid.message, fields: {}, usage };
  }

  return {
    ok: true,
    identified: true,
    game: vid.game || gameHint,
    kind: vid.kind,
    provider: vid.provider,
    source: "none",
    // name, set_name, rarity, and (for slabs) grade_company / grade / cert_number.
    fields: vid.fields,
    // No stock art — the scanned photo is the product picture (used by the caller).
    message: vid.message, // "Read from the … by Gemini/Groq — please confirm …"
    usage,
  };
}

export interface QuickAddInput {
  kind: ItemKind;
  name: string;
  game: string;
  set_name?: string;
  rarity?: string;
  condition?: string;
  grade_company?: string;
  grade?: string;
  cert_number?: string;
  barcode?: string;
  image?: string;
  marketPrice?: number; // cents
  costCents: number;
  priceCents: number;
  qty: number;
  notes?: string;
}

/** Save straight from the scanner's preview card into the catalog. */
export async function quickAddProductAction(
  input: QuickAddInput
): Promise<{ ok: boolean; error?: string; id?: number; sku?: string }> {
  const user = requireModule("inventory");
  const db = getDb();

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (input.priceCents < 0 || input.costCents < 0) return { ok: false, error: "Prices can't be negative." };
  const qty = Math.max(0, Math.round(input.qty || 0));

  const category = input.kind === "graded" ? "graded" : input.kind === "raw" ? "single" : "sealed";
  const game = input.game || "Pokémon";

  const okData = (input.image ?? "").startsWith("data:image/") && (input.image ?? "").length < 1_400_000;
  const okUrl = /^https:\/\/[^\s"'<>]+$/.test(input.image ?? "") && (input.image ?? "").length < 600;
  const image = okData || okUrl ? input.image! : null;

  try {
    const code =
      { "Pokémon": "PKM", "One Piece": "OPC", "Yu-Gi-Oh!": "YGO", "Weiss Schwarz": "WSC", "Union Arena": "UNA",
        Magic: "MTG", Digimon: "DGM", "Dragon Ball": "DBS", Gundam: "GCG", Accessories: "ACC" }[game] ?? "GEN";
    const n = (db.prepare("SELECT COUNT(*) c FROM products").get() as { c: number }).c + 1;
    const sku = `${code}-${String(n).padStart(4, "0")}`;

    const r = db
      .prepare(
        `INSERT INTO products (sku, barcode, name, game, category, set_name, rarity, condition, language, foil,
          grade_company, grade, cert_number, image, notes, market_price, price, cost, stock, low_stock, active, created_at)
         VALUES (@sku, @barcode, @name, @game, @category, @set_name, @rarity, @condition, 'EN', 0,
          @grade_company, @grade, @cert_number, @image, @notes, @market_price, @price, @cost, @stock, @low_stock, 1, @created_at)`
      )
      .run({
        sku,
        barcode: input.barcode?.trim() || null,
        name,
        game,
        category,
        set_name: input.set_name?.trim() || null,
        rarity: input.rarity?.trim() || null,
        condition: input.condition?.trim() || null,
        grade_company: input.grade_company?.trim() || null,
        grade: input.grade?.trim() || null,
        cert_number: input.cert_number?.trim() || null,
        image,
        notes: input.notes?.trim() || null,
        market_price: input.marketPrice ?? null,
        price: Math.round(input.priceCents),
        cost: Math.round(input.costCents),
        stock: qty,
        low_stock: category === "graded" ? 0 : 2,
        created_at: ts(),
      });

    const id = Number(r.lastInsertRowid);
    audit(user.id, "inventory.quick_add", "product", id, `${sku} — ${name} (scanned)`);
    return { ok: true, id, sku };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}
