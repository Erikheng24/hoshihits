import "server-only";
import { getDb } from "./db";
import { money } from "./format";
import { sendMessageTo, sendPhotoDataUrl, sendPhotoByFileId, sendTelegram, adminChatLink, getTelegramConfig } from "./providers/telegram";

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
  await sendMessageTo(chatId, "Tap below once you've paid, or to talk to us 👇", {
    inline_keyboard: [
      [{ text: "✅ I've paid — send screenshot", callback_data: `paid:${o.number}` }],
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
    ? `📸 <b>Payment proof</b> — order <b>${esc(o.number)}</b>\n👤 ${esc(o.customer_name)} · ${esc(o.customer_phone)}\n💰 <b>${money(o.total)}</b>\nVerify, then mark it Paid in Web Orders.`
    : "📸 <b>Payment proof</b> from a customer (no matching order found).";
  await sendPhotoByFileId(adminChatId, fileId, caption);
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
