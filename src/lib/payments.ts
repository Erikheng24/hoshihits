import "server-only";
import { getDb, nextNumber, ts, type DbConn } from "./db";
import { generateKhqr } from "./khqr";
import { checkKhqrPaid } from "./providers/bakong";

/**
 * Checkout + KHQR payment engine.
 *
 * Cash/card sales commit immediately. A KHQR sale instead opens a *pending
 * payment*: the cart is snapshotted, a dynamic QR is generated, and the sale is
 * only committed (stock deducted, receipt available) once Bakong confirms the
 * money arrived. Kept out of the "use server" action file so the polling API
 * routes can import it directly.
 */

const db = () => getDb();

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

interface Priced {
  resolved: { id: number; name: string; qty: number; price: number; cost: number; stock: number }[];
  subtotal: number;
  costTotal: number;
  discount: number;
  total: number;
  customerId: number | null;
}

/** Validate a cart and compute money. Throws a user-facing message on any problem. */
function priceCart(db: DbConn, input: CheckoutInput, allowOversell = false): Priced {
  if (!input.lines?.length) throw new Error("Cart is empty.");
  if (input.discountCents < 0) throw new Error("Invalid discount.");

  let subtotal = 0;
  let costTotal = 0;
  const resolved: Priced["resolved"] = [];
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new Error("Invalid quantity.");
    const p = db
      .prepare("SELECT id, name, price, cost, stock, active FROM products WHERE id = ?")
      .get(line.productId) as { id: number; name: string; price: number; cost: number; stock: number; active: number } | undefined;
    if (!p || !p.active) throw new Error("A product in the cart no longer exists.");
    if (!allowOversell && p.stock < line.qty) throw new Error(`Not enough stock for "${p.name}" (${p.stock} left).`);
    resolved.push({ id: p.id, name: p.name, qty: line.qty, price: p.price, cost: p.cost, stock: p.stock });
    subtotal += p.price * line.qty;
    costTotal += p.cost * line.qty;
  }

  let customerId: number | null = null;
  if (input.customerId) {
    const c = db.prepare("SELECT id FROM customers WHERE id = ?").get(input.customerId) as { id: number } | undefined;
    if (!c) throw new Error("Customer not found.");
    customerId = c.id;
  }

  const discount = Math.min(input.discountCents, subtotal);
  return { resolved, subtotal, costTotal, discount, total: subtotal - discount, customerId };
}

/** Commit a sale from a validated cart. Must run inside a transaction. */
function commitSale(db: DbConn, input: CheckoutInput, userId: number, allowOversell = false): CheckoutResult & { total: number } {
  const priced = priceCart(db, input, allowOversell);
  const { total } = priced;

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
    .run(number, priced.customerId, userId, priced.subtotal, priced.discount, total, priced.costTotal, input.method, amountPaid, changeDue, ts());
  const saleId = Number(saleRes.lastInsertRowid);

  const insItem = db.prepare("INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price, unit_cost) VALUES (?,?,?,?,?,?)");
  const decStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
  for (const r of priced.resolved) {
    insItem.run(saleId, r.id, r.name, r.qty, r.price, r.cost);
    decStock.run(r.qty, r.id);
  }
  return { ok: true, saleId, number, changeDue, total };
}

/** Cash/card checkout — commits immediately. */
export function checkout(input: CheckoutInput, userId: number): CheckoutResult {
  try {
    const r = db().transaction(() => commitSale(db(), input, userId))();
    return { ok: true, saleId: r.saleId, number: r.number, changeDue: r.changeDue };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout failed." };
  }
}

// ---- KHQR pending payments ----

export interface StartPaymentResult {
  ok: boolean;
  error?: string;
  paymentId?: number;
  image?: string;
  amount?: number;
  ref?: string;
}

/** Open a pending KHQR payment: validate the cart, generate the QR, store it. */
export async function startPayment(input: CheckoutInput, userId: number): Promise<StartPaymentResult> {
  let priced: Priced;
  try {
    priced = priceCart(db(), input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Cart problem." };
  }
  if (priced.total <= 0) return { ok: false, error: "Total must be greater than zero." };

  const ref = `H${Date.now().toString(36).toUpperCase()}`;
  const qr = await generateKhqr(priced.total, ref);
  if (!qr.ok || !qr.image || !qr.md5 || !qr.qr) return { ok: false, error: qr.message ?? "Couldn't create the QR." };

  const now = new Date();
  const expires = new Date(now.getTime() + 6 * 60 * 1000);
  const r = db()
    .prepare(
      `INSERT INTO payments (ref, md5, qr, image, amount, currency, status, cart, customer_id, user_id, created_at, expires_at)
       VALUES (?,?,?,?,?, 'USD', 'pending', ?, ?, ?, ?, ?)`
    )
    .run(ref, qr.md5, qr.qr, qr.image, priced.total, JSON.stringify(input), priced.customerId, userId, ts(now), ts(expires));

  return { ok: true, paymentId: Number(r.lastInsertRowid), image: qr.image, amount: priced.total, ref };
}

interface PaymentRow {
  id: number;
  md5: string;
  image: string;
  amount: number;
  status: string;
  cart: string;
  user_id: number | null;
  sale_id: number | null;
  expires_at: string;
}

export interface PollResult {
  status: "pending" | "paid" | "expired" | "cancelled" | "error";
  saleId?: number;
  number?: string;
  message?: string;
}

/** Check a pending payment against Bakong and, if paid, commit the sale (once). */
export async function pollPayment(id: number): Promise<PollResult> {
  const p = db().prepare("SELECT id, md5, image, amount, status, cart, user_id, sale_id, expires_at FROM payments WHERE id = ?").get(id) as
    | PaymentRow
    | undefined;
  if (!p) return { status: "error", message: "Payment not found." };

  if (p.status === "paid") {
    const s = p.sale_id ? (db().prepare("SELECT number FROM sales WHERE id = ?").get(p.sale_id) as { number: string } | undefined) : undefined;
    return { status: "paid", saleId: p.sale_id ?? undefined, number: s?.number };
  }
  if (p.status === "cancelled") return { status: "cancelled" };
  if (p.status === "expired") return { status: "expired" };
  if (Date.now() > new Date(p.expires_at.replace(" ", "T")).getTime()) {
    db().prepare("UPDATE payments SET status = 'expired' WHERE id = ? AND status = 'pending'").run(id);
    return { status: "expired" };
  }

  const check = await checkKhqrPaid(p.md5);
  if (check.status === "error") return { status: "error", message: check.message };
  if (check.status === "pending") return { status: "pending" };

  // Paid at the bank — commit the sale atomically, guarding against a double commit.
  try {
    const result = db().transaction(() => {
      const fresh = db().prepare("SELECT status, cart, user_id FROM payments WHERE id = ?").get(id) as
        | { status: string; cart: string; user_id: number | null }
        | undefined;
      if (!fresh) throw new Error("Payment vanished.");
      if (fresh.status === "paid") {
        const existing = db().prepare("SELECT sale_id FROM payments WHERE id = ?").get(id) as { sale_id: number | null };
        return { saleId: existing.sale_id ?? 0, number: "", already: true as const };
      }
      const input = JSON.parse(fresh.cart) as CheckoutInput;
      // Payment already succeeded, so never block on stock — allow overselling.
      const sale = commitSale(db(), { ...input, method: "qr" }, fresh.user_id ?? 0, true);
      db().prepare("UPDATE payments SET status = 'paid', sale_id = ? WHERE id = ?").run(sale.saleId, id);
      return { saleId: sale.saleId!, number: sale.number!, already: false as const };
    })();

    if (result.already) {
      const s = db().prepare("SELECT number FROM sales WHERE id = ?").get(result.saleId) as { number: string } | undefined;
      return { status: "paid", saleId: result.saleId, number: s?.number };
    }
    return { status: "paid", saleId: result.saleId, number: result.number };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Payment received but the sale couldn't be saved — check stock." };
  }
}

export function cancelPayment(id: number): void {
  db().prepare("UPDATE payments SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id);
}

/** The most recent still-relevant payment, for the customer display to show. */
export function getActivePaymentId(): number | null {
  const row = db()
    .prepare(
      `SELECT id FROM payments
       WHERE status IN ('pending','paid') AND created_at >= ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(ts(new Date(Date.now() - 10 * 60 * 1000))) as { id: number } | undefined;
  return row?.id ?? null;
}

export interface DisplayState {
  idle: boolean;
  paymentId?: number;
  image?: string;
  amount?: number;
  ref?: string;
  status?: string;
  number?: string;
}

/** Snapshot for the customer display (also drives payment detection while showing). */
export async function getDisplayState(): Promise<DisplayState> {
  const id = getActivePaymentId();
  if (!id) return { idle: true };

  const before = db().prepare("SELECT status FROM payments WHERE id = ?").get(id) as { status: string } | undefined;
  let poll: PollResult | null = null;
  if (before?.status === "pending") poll = await pollPayment(id);

  const p = db().prepare("SELECT id, image, amount, ref, status FROM payments WHERE id = ?").get(id) as
    | { id: number; image: string; amount: number; ref: string; status: string }
    | undefined;
  if (!p) return { idle: true };
  // Only surface pending (show QR) or freshly paid (show thanks); ignore old expired/cancelled.
  if (p.status !== "pending" && p.status !== "paid") return { idle: true };

  return {
    idle: false,
    paymentId: p.id,
    image: p.image,
    amount: p.amount,
    ref: p.ref,
    status: p.status,
    number: poll?.number,
  };
}
