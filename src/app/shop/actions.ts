"use server";

import { getDb, nextNumber, ts } from "@/lib/db";
import { getBranding } from "@/lib/branding";
import { sendTelegram, adminChatLink, telegramConfigured, botTokenSet, getBotUsername } from "@/lib/providers/telegram";
import { money } from "@/lib/format";

export interface WebOrderLine {
  productId: number;
  qty: number;
}
export interface PlaceOrderInput {
  name: string;
  phone: string;
  note?: string;
  location?: string; // address or a Google Maps link
  items: WebOrderLine[];
}
export interface PlaceOrderResult {
  ok: boolean;
  error?: string;
  number?: string;
  telegramLink?: string | null; // bot deep link (preferred) or admin chat
  usesBot?: boolean;            // link opens the order bot (shows QR + buttons)
  telegramSent?: boolean;       // order was pushed to the shop's Telegram
  orderText?: string;           // plain text, for the copy-&-paste fallback
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Save a storefront order and notify the shop's Telegram. Never trusts client prices. */
export async function placeWebOrderAction(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const db = getDb();
  const name = (input.name ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const note = (input.note ?? "").trim() || null;
  const location = (input.location ?? "").trim().slice(0, 500) || null;

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!phone) return { ok: false, error: "Please enter your phone number." };
  if (!input.items?.length) return { ok: false, error: "Your cart is empty." };

  // Resolve every line against the real catalog (price + availability come from us).
  const resolved: { id: number; name: string; qty: number; price: number }[] = [];
  for (const line of input.items) {
    const qty = Math.max(1, Math.round(Number(line.qty) || 0));
    const p = db
      .prepare("SELECT id, name, price, stock, active FROM products WHERE id = ?")
      .get(line.productId) as { id: number; name: string; price: number; stock: number; active: number } | undefined;
    if (!p || !p.active) continue; // silently drop items that vanished
    resolved.push({ id: p.id, name: p.name, qty, price: p.price });
  }
  if (!resolved.length) return { ok: false, error: "None of those items are available anymore." };

  const total = resolved.reduce((a, l) => a + l.price * l.qty, 0);
  const number = nextNumber("WEB", "web_orders", 4);

  const orderId = db.transaction(() => {
    const r = db
      .prepare("INSERT INTO web_orders (number, customer_name, customer_phone, note, total, status, location, created_at) VALUES (?,?,?,?,?, 'new', ?, ?)")
      .run(number, name, phone, note, total, location, ts());
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare("INSERT INTO web_order_items (order_id, product_id, name, qty, unit_price) VALUES (?,?,?,?,?)");
    for (const l of resolved) ins.run(id, l.id, l.name, l.qty, l.price);
    return id;
  })();

  // Plain text (fallback copy) + HTML (Telegram) versions of the order.
  const brand = getBranding();
  const lines = resolved.map((l) => `• ${l.qty} × ${l.name} — ${money(l.price * l.qty)}`);
  const plain = [
    `🛒 New order ${number} — ${brand.name}`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    ...(location ? [`Location: ${location}`] : []),
    ...(note ? [`Note: ${note}`] : []),
    ``,
    ...lines,
    ``,
    `Total: ${money(total)}`,
    ``,
    `Please advise payment. Thank you!`,
  ].join("\n");

  const locText = location
    ? /^https?:\/\//i.test(location)
      ? `📍 <a href="${esc(location)}">Open location</a>`
      : `📍 ${esc(location)}`
    : "";
  const html = [
    `🔔 <b>NEW ORDER — ${esc(number)}</b>`,
    `👤 <b>${esc(name)}</b>`,
    `📞 ${esc(phone)}`,
    ...(locText ? [locText] : []),
    ...(note ? [`📝 ${esc(note)}`] : []),
    ``,
    ...resolved.map((l) => `• ${l.qty} × ${esc(l.name)} — <b>${money(l.price * l.qty)}</b>`),
    ``,
    `💰 <b>Total: ${money(total)}</b>`,
    ``,
    `The customer is being taken to the bot to pay.`,
  ].join("\n");

  // Notify the shop's own Telegram straight away (even if the customer never
  // opens the bot).
  let telegramSent = false;
  if (telegramConfigured()) {
    const sent = await sendTelegram(html);
    telegramSent = sent.ok;
  }

  // Prefer sending the customer into the BOT (it shows the order + payment QR +
  // buttons). Fall back to the admin chat, then to copy-&-paste.
  let botLink: string | null = null;
  if (botTokenSet()) {
    const uname = await getBotUsername();
    if (uname) botLink = `https://t.me/${uname}?start=${encodeURIComponent(number)}`;
  }

  return {
    ok: true,
    number,
    telegramLink: botLink ?? adminChatLink(),
    usesBot: !!botLink,
    telegramSent,
    orderText: plain,
  };
}
