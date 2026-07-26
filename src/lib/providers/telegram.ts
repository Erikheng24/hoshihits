import "server-only";
import crypto from "crypto";
import { getDb } from "@/lib/db";

/**
 * Telegram bot for the customer storefront.
 *
 * A free bot (from @BotFather) does two jobs:
 *   1. Notifies the shop of every new order (owner's chat).
 *   2. Chats with the customer after "Order now": confirms the order, shows the
 *      shop's ABA/ACLEDA payment QR images, and offers "I've paid" / "Contact
 *      admin" buttons — driven by a webhook (/api/telegram/webhook).
 *
 * Config (Settings): telegram_bot_token, telegram_admin_chat_id,
 * telegram_admin_username. Payment QRs: payment_qr_aba, payment_qr_acleda.
 */
export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
  adminUsername: string; // without @
}

export function getTelegramConfig(): TelegramConfig {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings WHERE key IN ('telegram_bot_token','telegram_admin_chat_id','telegram_admin_username')")
    .all() as { key: string; value: string }[];
  const m = new Map(rows.map((r) => [r.key, (r.value ?? "").trim()]));
  return {
    botToken: m.get("telegram_bot_token") || process.env.TELEGRAM_BOT_TOKEN || "",
    adminChatId: m.get("telegram_admin_chat_id") || process.env.TELEGRAM_ADMIN_CHAT_ID || "",
    adminUsername: (m.get("telegram_admin_username") || process.env.TELEGRAM_ADMIN_USERNAME || "").replace(/^@/, ""),
  };
}

export function telegramConfigured(): boolean {
  const c = getTelegramConfig();
  return !!c.botToken && !!c.adminChatId;
}

/** True when just the bot token is set (enough for the customer chat flow). */
export function botTokenSet(): boolean {
  return !!getTelegramConfig().botToken;
}

export function adminChatLink(): string | null {
  const u = getTelegramConfig().adminUsername;
  return u ? `https://t.me/${u}` : null;
}

/** A stable secret for the Telegram webhook, derived from HOSHI_SECRET. */
export function webhookSecret(): string {
  const base = process.env.HOSHI_SECRET ?? "hoshihits-dev-secret-change-in-production";
  return crypto.createHmac("sha256", base).update("telegram-webhook").digest("hex").slice(0, 40);
}

type InlineKeyboard = { inline_keyboard: { text: string; url?: string; callback_data?: string; web_app?: { url: string } }[][] };

async function api(method: string, body: unknown): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const { botToken } = getTelegramConfig();
  if (!botToken) return { ok: false, description: "No bot token set." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; description?: string };
  } catch {
    return { ok: false, description: "Couldn't reach Telegram." };
  }
}

export interface TelegramResult {
  ok: boolean;
  message?: string;
}

/** Send an HTML message to the shop's own Telegram (order notifications). */
export async function sendTelegram(text: string): Promise<TelegramResult> {
  const { adminChatId } = getTelegramConfig();
  if (!adminChatId) return { ok: false, message: "No admin chat ID set in Settings." };
  const r = await api("sendMessage", { chat_id: adminChatId, text, parse_mode: "HTML", disable_web_page_preview: true });
  return { ok: r.ok, message: r.ok ? undefined : r.description || "Telegram rejected the message." };
}

/** Send an HTML message to any chat (e.g. replying to a customer), with optional buttons. */
export async function sendMessageTo(chatId: string | number, text: string, keyboard?: InlineKeyboard): Promise<TelegramResult> {
  const r = await api("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  return { ok: r.ok, message: r.description };
}

/** Send a photo (from a data URL) to a chat — used for the payment QR images. */
export async function sendPhotoDataUrl(chatId: string | number, dataUrl: string, caption?: string): Promise<TelegramResult> {
  const { botToken } = getTelegramConfig();
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!botToken || !m) return { ok: false, message: "No photo / bot token." };
  try {
    const ext = m[1].split("/")[1].replace("jpeg", "jpg");
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
    }
    form.append("photo", new Blob([Buffer.from(m[2], "base64")], { type: m[1] }), `qr.${ext}`);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const d = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; description?: string };
    return { ok: d.ok, message: d.description };
  } catch {
    return { ok: false, message: "Couldn't upload the photo to Telegram." };
  }
}

export async function answerCallback(callbackId: string, text?: string): Promise<void> {
  await api("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });
}

/** Forward an already-uploaded photo (by its Telegram file_id) to a chat. */
export async function sendPhotoByFileId(chatId: string | number, fileId: string, caption?: string): Promise<TelegramResult> {
  const r = await api("sendPhoto", {
    chat_id: chatId,
    photo: fileId,
    ...(caption ? { caption, parse_mode: "HTML" } : {}),
  });
  return { ok: r.ok, message: r.description };
}

/** Point Telegram at our webhook so the bot can chat with customers. */
export async function setWebhook(baseUrl: string): Promise<TelegramResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
  const r = await api("setWebhook", {
    url,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  return { ok: r.ok, message: r.ok ? `Bot connected to ${url}` : r.description || "setWebhook failed." };
}

/** The bot's @username, used to build the t.me/<bot>?start=… order deep link. */
export async function getBotUsername(): Promise<string | null> {
  const r = await api("getMe", {});
  const u = (r.result as { username?: string } | undefined)?.username;
  return r.ok && u ? u : null;
}
