"use server";

import { revalidatePath } from "next/cache";
import { getDb, audit, nextNumber, nextSku, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export interface TradeLine {
  name: string;
  game: string;
  condition: string;
  qty: number;
  unitValueCents: number;
}

export interface TradeInput {
  customerId: number | null;
  kind: "buylist" | "tradein";
  addToStock: boolean;
  lines: TradeLine[];
}

export interface TradeResult {
  ok: boolean;
  error?: string;
  number?: string;
  total?: number;
}

export async function createTradeinAction(input: TradeInput): Promise<TradeResult> {
  const user = requireModule("tradein");
  const db = getDb();

  const lines = (input.lines ?? []).filter((l) => l.name.trim());
  if (!lines.length) return { ok: false, error: "Add at least one card." };
  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty < 1) return { ok: false, error: "Invalid quantity." };
    if (l.unitValueCents < 0) return { ok: false, error: "Invalid value." };
  }

  try {
    const result = db.transaction(() => {
      const total = lines.reduce((a, l) => a + l.qty * l.unitValueCents, 0);
      const number = nextNumber("TR", "tradeins", 4);
      const r = db
        .prepare("INSERT INTO tradeins (number, customer_id, kind, payout_method, total, user_id, created_at) VALUES (?,?,?,'cash',?,?,?)")
        .run(number, input.customerId, input.kind, total, user.id, ts());
      const id = Number(r.lastInsertRowid);

      const insItem = db.prepare(
        "INSERT INTO tradein_items (tradein_id, name, game, condition, qty, unit_value) VALUES (?,?,?,?,?,?)"
      );
      for (const l of lines) insItem.run(id, l.name.trim(), l.game || null, l.condition || null, l.qty, l.unitValueCents);

      if (input.addToStock) {
        const codeMap: Record<string, string> = {
          "Pokémon": "PKM", "One Piece": "OPC", "Yu-Gi-Oh!": "YGO", "Weiss Schwarz": "WSC", "Union Arena": "UNA",
          Magic: "MTG", Digimon: "DGM", "Dragon Ball": "DBS", Gundam: "GCG",
        };
        const insProd = db.prepare(
          `INSERT INTO products (sku, name, game, category, condition, language, price, cost, stock, low_stock, active, created_at)
           VALUES (?,?,?,'single',?,'EN',?,?,?,0,1,?)`
        );
        for (const l of lines) {
          const sku = nextSku(codeMap[l.game] ?? "GEN");
          // Default resale price: 40% markup over buy price, rounded to .00
          const price = Math.round((l.unitValueCents * 1.4) / 100) * 100;
          insProd.run(sku, l.name.trim(), l.game || "Pokémon", l.condition || "NM", price, l.unitValueCents, l.qty, ts());
        }
      }

      return { id, number, total };
    })();

    audit(user.id, `tradein.${input.kind}`, "tradein", result.id, `${result.number} — ${lines.length} card(s), cash payout`);
    revalidatePath("/tradein");
    revalidatePath("/inventory");
    return { ok: true, number: result.number, total: result.total };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Intake failed." };
  }
}
