import "server-only";
import { getDb } from "./db";
import { money } from "./format";
import { sendMessageTo, sendPhotoDataUrl, sendPhotoByFileId, sendForceReply, sendTelegram, adminChatLink, getTelegramConfig } from "./providers/telegram";

/** Inline buttons for an order in the admin chat (approve / send delivery). */
export function adminOrderKeyboard(orderNumber: string, stage: "approve" | "deliver" = "approve") {
  return {
    inline_keyboard: [
      stage === "approve"
        ? [{ text: "✅ Approve order", callback_data: `approve:${orderNumber}` }]
        : [{ text: "📦 Send delivery to customer", callback_data: `deliver:${orderNumber}` }],
    ],
  };
}
/** Marker text the delivery force-reply prompt carries, so a reply can be matched to an order. */
const DELIVERY_MARKER = (n: string) => `🚚 DELIVERY for order ${n}`;
export function parseDeliveryOrder(replyText: string | undefined): string | null {
  const m = (replyText ?? "").match(/DELIVERY for order (\S+)/);
  return m ? m[1] : null;
}

/**
 * The customer-facing bot conversation for storefront orders: after "Order now"
 * the customer opens the bot, which confirms the order, shows the shop's
 * ABA/ACLEDA payment QR images, and offers "I've paid" / "Contact admin".
 */

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const setting = (k: string) =>
  (getDb().prepare("SELECT value FROM settings WHERE key=?").get(k) as { value: string } | undefined)?.value ?? "";

interface OrderRow {
  id: number;
  number: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  status: string;
}

function findOrder(orderNumber: string): OrderRow | undefined {
  return getDb().prepare("SELECT id, number, customer_name, customer_phone, total, status FROM web_orders WHERE number = ?").get(orderNumber) as
    | OrderRow
    | undefined;
}

/** Send the order confirmation + payment QR + action buttons to the customer. */
export async function sendCustomerOrder(chatId: string | number, orderNumber: string): Promise<void> {
  const o = findOrder(orderNumber);
  if (!o) {
    await sendMessageTo(chatId, "Sorry, we couldn't find that order. Please place it again on our shop. 🙏");
    return;
  }
  const db = getDb();
  const items = db.prepare("SELECT name, qty, unit_price FROM web_order_items WHERE order_id = ?").all(o.id) as
    { name: string; qty: number; unit_price: number }[];

  const lines = items.map((i) => `• ${i.qty} × ${esc(i.name)} — <b>${money(i.qty * i.unit_price)}</b>`).join("\n");
  await sendMessageTo(
    chatId,
    `🛒 <b>Order ${esc(o.number)}</b>\n👤 ${esc(o.customer_name)}\n\n${lines}\n\n💰 <b>Total: ${money(o.total)}</b>\n\nPlease pay by scanning a QR below, then tap <b>✅ I've paid</b>.`
  );

  const aba = setting("payment_qr_aba");
  const acleda = setting("payment_qr_acleda");
  const note = setting("payment_note");
  if (aba) await sendPhotoDataUrl(chatId, aba, `🏦 <b>ABA</b> — pay <b>${money(o.total)}</b>`);
  if (acleda) await sendPhotoDataUrl(chatId, acleda, `🏦 <b>ACLEDA</b> — pay <b>${money(o.total)}</b>`);
  if (!aba && !acleda) {
    await sendMessageTo(chatId, note || "Our team will message you payment details shortly.");
  } else if (note) {
    await sendMessageTo(chatId, note);
  }

  const link = adminChatLink();
  const base = (setting("app_base_url") || process.env.APP_BASE_URL || "https://hoshihits.onrender.com").replace(/\/+$/, "");
  await sendMessageTo(chatId, "After you pay, tap the button to send your payment photo 👇", {
    inline_keyboard: [
      [{ text: "📸 Submit payment photo", web_app: { url: `${base}/pay-proof?order=${encodeURIComponent(o.number)}` } }],
      link ? [{ text: "💬 Contact admin", url: link }] : [{ text: "💬 Contact admin", callback_data: `contact:${o.number}` }],
    ],
  });

  // Remember this customer's chat so their payment-proof photo can be matched.
  db.prepare("UPDATE web_orders SET status = 'contacted', customer_chat_id = ? WHERE id = ?").run(String(chatId), o.id);
}

/** Customer tapped "I've paid" — ask for the payment screenshot and alert the shop. */
export async function handlePaidClaim(chatId: string | number, orderNumber: string): Promise<void> {
  const o = findOrder(orderNumber);
  if (o) getDb().prepare("UPDATE web_orders SET customer_chat_id = ? WHERE id = ?").run(String(chatId), o.id);
  await sendMessageTo(
    chatId,
    "🙏 Thank you! Please <b>send a photo/screenshot of your payment</b> here now, and we'll confirm your order shortly. 📸"
  );
  if (o) {
    await sendTelegram(
      `💸 <b>Payment claimed</b> for order <b>${esc(o.number)}</b>\n👤 ${esc(o.customer_name)} · ${esc(o.customer_phone)}\n💰 <b>${money(o.total)}</b>\nWaiting for their payment photo…`
    );
  }
}

/**
 * A customer sent a photo — treat it as payment proof, match it to their most
 * recent open order, and forward it (with the order details) to the shop.
 */
export async function handlePaymentPhoto(chatId: string | number, fileId: string): Promise<void> {
  const { adminChatId } = getTelegramConfig();
  const o = getDb()
    .prepare(
      "SELECT id, number, customer_name, customer_phone, total FROM web_orders WHERE customer_chat_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(String(chatId)) as OrderRow | undefined;

  await sendMessageTo(chatId, "✅ Got it — we've received your payment photo and will confirm your order shortly. Thank you! 🙏");

  if (!adminChatId) return;
  const caption = o
    ? `📸 <b>Payment proof</b> — order <b>${esc(o.number)}</b>\n👤 ${esc(o.customer_name)} · ${esc(o.customer_phone)}\n💰 <b>${money(o.total)}</b>`
    : "📸 <b>Payment proof</b> from a customer (no matching order found).";
  await sendPhotoByFileId(adminChatId, fileId, caption);
  if (o) await sendTelegram(`Approve order <b>${esc(o.number)}</b>?`, adminOrderKeyboard(o.number, "approve"));
}

/** Forward a payment-proof photo (from the Web App upload) to the shop's admin. */
export async function forwardPaymentProof(orderNumber: string, dataUrl: string): Promise<{ ok: boolean; message?: string }> {
  const { adminChatId } = getTelegramConfig();
  if (!adminChatId) return { ok: false, message: "The shop's Telegram isn't fully set up." };
  const o = findOrder(orderNumber);
  const caption = o
    ? `📸 <b>Payment proof</b> — order <b>${esc(o.number)}</b>\n👤 ${esc(o.customer_name)} · ${esc(o.customer_phone)}\n💰 <b>${money(o.total)}</b>`
    : `📸 <b>Payment proof</b> (order ${esc(orderNumber)})`;
  const r = await sendPhotoDataUrl(adminChatId, dataUrl, caption);
  if (o) await sendTelegram(`Approve order <b>${esc(o.number)}</b>?`, adminOrderKeyboard(o.number, "approve"));
  return { ok: r.ok, message: r.message };
}

/** Admin tapped "Approve order" — confirm to the customer and enable delivery. */
export async function approveOrder(orderNumber: string): Promise<void> {
  const db = getDb();
  const o = db
    .prepare("SELECT id, number, customer_name, total, status, customer_chat_id FROM web_orders WHERE number = ?")
    .get(orderNumber) as (OrderRow & { customer_chat_id: string | null }) | undefined;
  const { adminChatId } = getTelegramConfig();
  if (!o) { if (adminChatId) await sendTelegram("That order was not found."); return; }

  db.prepare("UPDATE web_orders SET status = 'paid' WHERE id = ?").run(o.id);
  if (o.customer_chat_id) {
    await sendMessageTo(o.customer_chat_id, `✅ <b>Your order ${esc(o.number)} is approved!</b>\nThank you — we're packing your order now and will send you delivery details shortly. 📦`);
  }
  await sendTelegram(`✅ <b>Approved ${esc(o.number)}</b> — the customer has been notified.\nWhen it's ready, send the delivery link/receipt 👇`, adminOrderKeyboard(o.number, "deliver"));
}

/** Admin tapped "Send delivery" — ask them to reply with the link/photo. */
export async function promptDelivery(adminChatId: string | number, orderNumber: string): Promise<void> {
  await sendForceReply(
    adminChatId,
    `${DELIVERY_MARKER(orderNumber)}\nReply to this with the <b>Grab link</b> (or attach the <b>delivery receipt photo</b>) and I'll send it to the customer.`
  );
}

/** The admin replied with delivery info → send it to the customer, mark delivered. */
export async function sendDeliveryToCustomer(orderNumber: string, opts: { text?: string; fileId?: string }): Promise<void> {
  const db = getDb();
  const o = db
    .prepare("SELECT id, number, customer_chat_id FROM web_orders WHERE number = ?")
    .get(orderNumber) as { id: number; number: string; customer_chat_id: string | null } | undefined;
  const { adminChatId } = getTelegramConfig();
  if (!o) { if (adminChatId) await sendTelegram("That order was not found."); return; }
  if (!o.customer_chat_id) { if (adminChatId) await sendTelegram(`No customer chat for ${esc(o.number)} — they haven't opened the bot yet.`); return; }

  if (opts.fileId) {
    await sendPhotoByFileId(o.customer_chat_id, opts.fileId, `📦 <b>Your order ${esc(o.number)} is on the way!</b> 🚚\nHere is your delivery receipt. Thank you for shopping with us! 🙏`);
  } else if (opts.text) {
    await sendMessageTo(o.customer_chat_id, `📦 <b>Your order ${esc(o.number)} is on the way!</b> 🚚\n${esc(opts.text)}\n\nThank you for shopping with us! 🙏`);
  }
  db.prepare("UPDATE web_orders SET status = 'fulfilled' WHERE id = ?").run(o.id);
  if (adminChatId) await sendTelegram(`✅ Delivery sent to the customer — order <b>${esc(o.number)}</b> marked delivered.`);
}

/** Customer tapped "Contact admin" (fallback when no @username link is set). */
export async function handleContact(chatId: string | number, orderNumber: string): Promise<void> {
  const o = findOrder(orderNumber);
  const link = adminChatLink();
  await sendMessageTo(
    chatId,
    link ? `Message our team here: ${link}` : "Our team has been notified and will message you here shortly. 🙏"
  );
  await sendTelegram(
    `💬 <b>Support request</b>${o ? ` for order <b>${esc(o.number)}</b>` : ""}\nA customer asked to contact you in the bot.`
  );
}
