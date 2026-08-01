"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, nextNumber, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export interface PreorderItemInput {
  product_name: string;
  game?: string;
  qty: number;
  unitPriceCents: number;
  image?: string;
}
export interface CreatePreorderInput {
  customerId: number;
  expectedDate?: string;
  depositCents: number;
  items: PreorderItemInput[];
}

/** Create a multi-item preorder (a customer reserving several boxes/cards). */
export async function createPreorderAction(
  input: CreatePreorderInput
): Promise<{ ok: boolean; error?: string; id?: number; number?: string }> {
  const user = requireModule("preorders");
  const db = getDb();
  if (!input.customerId) return { ok: false, error: "Customer is required." };

  const items = (input.items ?? [])
    .map((it) => ({
      product_name: (it.product_name ?? "").trim(),
      game: (it.game ?? "").trim() || null,
      qty: Math.max(1, Math.round(it.qty || 1)),
      unit_price: Math.max(0, Math.round(it.unitPriceCents || 0)),
      image: (it.image ?? "").startsWith("data:image/") && (it.image ?? "").length < 1_400_000 ? it.image! : null,
    }))
    .filter((it) => it.product_name && it.unit_price > 0);
  if (!items.length) return { ok: false, error: "Add at least one item with a name and price." };

  const total = items.reduce((a, it) => a + it.unit_price * it.qty, 0);
  const deposit = Math.max(0, Math.round(input.depositCents || 0));
  if (deposit > total) return { ok: false, error: "Deposit can't be more than the total." };
  const expected = (input.expectedDate ?? "").trim() || null;

  const customer = db.prepare("SELECT id FROM customers WHERE id=?").get(input.customerId);
  if (!customer) return { ok: false, error: "Customer not found." };

  try {
    const number = nextNumber("PRE", "preorders", 4);
    const id = db.transaction(() => {
      // Header keeps a summary in the legacy columns; the real lines go in preorder_items.
      const summary = items.length > 1 ? `${items[0].product_name} +${items.length - 1} more` : items[0].product_name;
      const totalQty = items.reduce((a, it) => a + it.qty, 0);
      const r = db
        .prepare(
          `INSERT INTO preorders (number, customer_id, product_id, product_name, game, qty, unit_price, deposit, total, status, expected_date, image, user_id, created_at)
           VALUES (?,?,NULL,?,?,?,?,?,?, 'pending', ?, ?, ?, ?)`
        )
        .run(number, input.customerId, summary, items[0].game, totalQty, 0, deposit, total, expected, items[0].image, user.id, ts());
      const pid = Number(r.lastInsertRowid);
      const ins = db.prepare("INSERT INTO preorder_items (preorder_id, product_name, game, qty, unit_price, image) VALUES (?,?,?,?,?,?)");
      for (const it of items) ins.run(pid, it.product_name, it.game, it.qty, it.unit_price, it.image);
      return pid;
    })();
    audit(user.id, "preorders.create", "preorder", id, `${number} — ${items.length} item(s), total ${total / 100}`);
    return { ok: true, id, number };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't create the preorder." };
  }
}

const FLOW: Record<string, string> = { pending: "arrived", arrived: "ready", ready: "collected" };

export async function advancePreorderAction(formData: FormData) {
  const user = requireModule("preorders");
  const db = getDb();
  const id = Number(formData.get("id"));
  const p = db.prepare("SELECT number, status FROM preorders WHERE id=?").get(id) as { number: string; status: string } | undefined;
  if (!p) throw new Error("Preorder not found.");
  const next = FLOW[p.status];
  if (!next) throw new Error("Preorder cannot be advanced further.");
  db.prepare("UPDATE preorders SET status=? WHERE id=?").run(next, id);
  audit(user.id, "preorders.status", "preorder", id, `${p.number}: ${p.status} → ${next}`);
  revalidatePath("/preorders");
  redirect("/preorders");
}

export async function cancelPreorderAction(formData: FormData) {
  const user = requireModule("preorders");
  const db = getDb();
  const id = Number(formData.get("id"));
  const p = db.prepare("SELECT number, status FROM preorders WHERE id=?").get(id) as { number: string; status: string } | undefined;
  if (!p) throw new Error("Preorder not found.");
  if (["collected", "cancelled"].includes(p.status)) throw new Error("Already finalized.");
  db.prepare("UPDATE preorders SET status='cancelled' WHERE id=?").run(id);
  audit(user.id, "preorders.cancel", "preorder", id, p.number);
  revalidatePath("/preorders");
  redirect("/preorders");
}

/** Permanently remove a preorder — for fixing a wrong entry (a customer's extra
 *  line that shouldn't exist). Unlike cancel, this deletes the row entirely. */
export async function deletePreorderAction(formData: FormData) {
  const user = requireModule("preorders");
  const db = getDb();
  const id = Number(formData.get("id"));
  const p = db.prepare("SELECT number, product_name FROM preorders WHERE id=?").get(id) as { number: string; product_name: string } | undefined;
  if (!p) throw new Error("Preorder not found.");
  db.transaction(() => {
    db.prepare("DELETE FROM preorder_items WHERE preorder_id=?").run(id);
    db.prepare("DELETE FROM preorders WHERE id=?").run(id);
  })();
  audit(user.id, "preorders.delete", "preorder", id, `${p.number} — ${p.product_name} (removed)`);
  revalidatePath("/preorders");
  redirect("/preorders");
}
