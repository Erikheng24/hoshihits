"use server";

import { getDb, audit, nextNumber, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export interface CartLine {
  productId: number;
  qty: number;
}

export interface CheckoutInput {
  lines: CartLine[];
  customerId: number | null;
  discountCents: number;
  method: "cash" | "card" | "qr";
  amountPaidCents: number;
}

export interface CheckoutResult {
  ok: boolean;
  error?: string;
  saleId?: number;
  number?: string;
  changeDue?: number;
}

export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  const user = requireModule("pos");
  const db = getDb();

  if (!input.lines?.length) return { ok: false, error: "Cart is empty." };
  if (input.discountCents < 0) return { ok: false, error: "Invalid discount." };

  try {
    const result = db.transaction(() => {
      let subtotal = 0;
      let costTotal = 0;
      const resolved: { id: number; name: string; qty: number; price: number; cost: number }[] = [];

      for (const line of input.lines) {
        if (!Number.isInteger(line.qty) || line.qty < 1) throw new Error("Invalid quantity.");
        const p = db
          .prepare("SELECT id, name, price, cost, stock, active FROM products WHERE id = ?")
          .get(line.productId) as { id: number; name: string; price: number; cost: number; stock: number; active: number } | undefined;
        if (!p || !p.active) throw new Error("A product in the cart no longer exists.");
        if (p.stock < line.qty) throw new Error(`Not enough stock for "${p.name}" (${p.stock} left).`);
        resolved.push({ id: p.id, name: p.name, qty: line.qty, price: p.price, cost: p.cost });
        subtotal += p.price * line.qty;
        costTotal += p.cost * line.qty;
      }

      const discount = Math.min(input.discountCents, subtotal);
      const total = subtotal - discount;

      let customerId: number | null = null;
      if (input.customerId) {
        const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(input.customerId) as { id: number } | undefined;
        if (!customer) throw new Error("Customer not found.");
        customerId = customer.id;
      }

      let amountPaid = input.amountPaidCents;
      if (input.method !== "cash") amountPaid = total;
      if (input.method === "cash" && amountPaid < total) throw new Error("Cash received is less than the total.");
      const changeDue = input.method === "cash" ? amountPaid - total : 0;

      const number = nextNumber("S", "sales");
      const saleRes = db
        .prepare(
          `INSERT INTO sales (number, customer_id, user_id, subtotal, discount, total, cost_total, payment_method, amount_paid, change_due, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?, 'completed', ?)`
        )
        .run(number, customerId, user.id, subtotal, discount, total, costTotal, input.method, amountPaid, changeDue, ts());
      const saleId = Number(saleRes.lastInsertRowid);

      const insItem = db.prepare(
        "INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price, unit_cost) VALUES (?,?,?,?,?,?)"
      );
      const decStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
      for (const r of resolved) {
        insItem.run(saleId, r.id, r.name, r.qty, r.price, r.cost);
        decStock.run(r.qty, r.id);
      }

      return { saleId, number, changeDue };
    })();

    audit(user.id, "pos.sale", "sale", result.saleId, `${result.number} — ${input.lines.length} line(s)`);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout failed." };
  }
}
