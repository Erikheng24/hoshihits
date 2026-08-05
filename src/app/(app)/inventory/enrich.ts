"use server";

import { requireModule } from "@/lib/auth";
import { getDb, audit, ts, getAiUsage, nextSku, type AiUsage } from "@/lib/db";
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
): Promise<{ ok: boolean; error?: string; id?: number; sku?: string; merged?: boolean; stock?: number }> {
  const user = requireModule("inventory");
  const db = getDb();

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (input.priceCents < 0 || input.costCents < 0) return { ok: false, error: "Prices can't be negative." };
  const qty = Math.max(0, Math.round(input.qty || 0));

  const category = input.kind === "graded" ? "graded" : input.kind === "raw" ? "single" : "sealed";
  const game = input.game || "Pokémon";
  const cert = input.cert_number?.trim() || null;

  const okData = (input.image ?? "").startsWith("data:image/") && (input.image ?? "").length < 1_400_000;
  const okUrl = /^https:\/\/[^\s"'<>]+$/.test(input.image ?? "") && (input.image ?? "").length < 600;
  const image = okData || okUrl ? input.image! : null;

  try {
    // Don't duplicate: a graded slab with the same cert, or any other item with
    // the same name/game/type, merges into the existing product (stock += qty).
    const existing = (
      category === "graded" && cert
        ? db.prepare("SELECT id, sku, stock FROM products WHERE cert_number = ? AND active = 1 LIMIT 1").get(cert)
        : db.prepare("SELECT id, sku, stock FROM products WHERE LOWER(name) = LOWER(?) AND game = ? AND category = ? AND active = 1 LIMIT 1").get(name, game, category)
    ) as { id: number; sku: string; stock: number } | undefined;
    if (existing) {
      const stock = existing.stock + qty;
      db.prepare("UPDATE products SET stock = ? WHERE id = ?").run(stock, existing.id);
      // If the existing product has no photo yet, add the one we just scanned.
      if (image) db.prepare("UPDATE products SET image = COALESCE(NULLIF(image, ''), ?) WHERE id = ?").run(image, existing.id);
      audit(user.id, "inventory.quick_merge", "product", existing.id, `${existing.sku} — ${name}: stock +${qty} → ${stock}`);
      return { ok: true, id: existing.id, sku: existing.sku, merged: true, stock };
    }
    const code =
      { "Pokémon": "PKM", "One Piece": "OPC", "Yu-Gi-Oh!": "YGO", "Weiss Schwarz": "WSC", "Union Arena": "UNA",
        Magic: "MTG", Digimon: "DGM", "Dragon Ball": "DBS", Gundam: "GCG", Accessories: "ACC" }[game] ?? "GEN";
    const sku = nextSku(code);

    // Positional params only — libsql's Turso write-forwarding binds @named to NULL.
    const r = db
      .prepare(
        `INSERT INTO products (sku, barcode, name, game, category, set_name, rarity, condition, language, foil,
          grade_company, grade, cert_number, image, notes, market_price, price, cost, stock, low_stock, active, created_at)
         VALUES (?,?,?,?,?,?,?,?, 'EN', 0, ?,?,?,?,?,?,?,?,?,?, 1, ?)`
      )
      .run(
        sku,
        input.barcode?.trim() || null,
        name,
        game,
        category,
        input.set_name?.trim() || null,
        input.rarity?.trim() || null,
        input.condition?.trim() || null,
        input.grade_company?.trim() || null,
        input.grade?.trim() || null,
        input.cert_number?.trim() || null,
        image,
        input.notes?.trim() || null,
        input.marketPrice ?? null,
        Math.round(input.priceCents),
        Math.round(input.costCents),
        qty,
        category === "graded" ? 0 : 2,
        ts()
      );

    const id = Number(r.lastInsertRowid);
    audit(user.id, "inventory.quick_add", "product", id, `${sku} — ${name} (scanned)`);
    return { ok: true, id, sku };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}
