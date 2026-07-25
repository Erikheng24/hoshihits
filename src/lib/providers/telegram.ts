import "server-only";
import { getDb } from "@/lib/db";

/**
 * Telegram notifications for the customer storefront.
 *
 * A free bot (from @BotFather) lets the website push each new order straight
 * into the shop's Telegram. Config lives in Settings:
 *   telegram_bot_token        – the bot token from BotFather
 *   telegram_admin_chat_id    – the chat that receives orders (owner DM or a group)
 *   telegram_admin_username   – the @username customers are sent to, to pay
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

/** True when the bot can push orders to the shop's Telegram. */
export function telegramConfigured(): boolean {
  const c = getTelegramConfig();
  return !!c.botToken && !!c.adminChatId;
}

/** The link a customer opens to chat with the shop about payment. */
export function adminChatLink(): string | null {
  const u = getTelegramConfig().adminUsername;
  return u ? `https://t.me/${u}` : null;
}

export interface TelegramResult {
  ok: boolean;
  message?: string;
}

/** Send a message (HTML formatted) to the shop's Telegram. */
export async function sendTelegram(text: string): Promise<TelegramResult> {
  const { botToken, adminChatId } = getTelegramConfig();
  if (!botToken || !adminChatId) return { ok: false, message: "Telegram bot isn't set up in Settings." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: adminChatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!data?.ok) return { ok: false, message: data?.description || "Telegram rejected the message — check the bot token and chat ID." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't reach Telegram." };
  }
}
