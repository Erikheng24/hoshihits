"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, nextNumber, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export async function createPreorderAction(formData: FormData) {
  const user = requireModule("preorders");
  const db = getDb();
  const customerId = Number(formData.get("customer_id"));
  const productName = String(formData.get("product_name") ?? "").trim();
  const game = String(formData.get("game") ?? "").trim() || null;
  const qty = Math.max(1, Math.round(Number(formData.get("qty") ?? 1)));
  const unitPrice = Math.round((parseFloat(String(formData.get("unit_price") ?? "0")) || 0) * 100);
  const deposit = Math.round((parseFloat(String(formData.get("deposit") ?? "0")) || 0) * 100);
  const expected = String(formData.get("expected_date") ?? "").trim() || null;

  // Optional reference photo of the ordered box/card (data URL from the picker).
  const rawImage = String(formData.get("image") ?? "");
  const image = rawImage.startsWith("data:image/") && rawImage.length < 1_400_000 ? rawImage : null;

  if (!customerId) throw new Error("Customer is required.");
  if (!productName) throw new Error("Product name is required.");
  if (unitPrice <= 0) throw new Error("Unit price must be positive.");
  if (deposit < 0 || deposit > unitPrice * qty) throw new Error("Invalid deposit.");

  const number = nextNumber("PRE", "preorders", 4);
  const r = db
    .prepare(
      `INSERT INTO preorders (number, customer_id, product_id, product_name, game, qty, unit_price, deposit, status, expected_date, image, user_id, created_at)
       VALUES (?,?,NULL,?,?,?,?,?, 'pending', ?, ?, ?, ?)`
    )
    .run(number, customerId, productName, game, qty, unitPrice, deposit, expected, image, user.id, ts());
  audit(user.id, "preorders.create", "preorder", Number(r.lastInsertRowid), `${number} — ${productName}`);
  revalidatePath("/preorders");
  redirect("/preorders");
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
