"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit } from "@/lib/db";
import { requireModule } from "@/lib/auth";
import { testKhqr } from "@/lib/payments";
import { sendTelegram, setWebhook } from "@/lib/providers/telegram";

const KEYS = [
  "store_name", "store_tagline", "store_address", "store_phone", "receipt_footer",
  // Receipt layout
  "receipt_logo_size", "receipt_font_scale", "receipt_header_note",
  // AI scanning
  "ai_daily_limit",
  // KHQR payment (Bakong)
  "khqr_account_id", "khqr_merchant_name", "khqr_city", "khqr_phone", "bakong_api_token",
  // ABA PayWay gateway
  "payway_merchant_id", "payway_api_key", "payway_sandbox", "payway_qr", "app_base_url",
  // Customer storefront + Telegram ordering
  "shop_enabled", "shop_welcome", "telegram_bot_token", "telegram_admin_chat_id", "telegram_admin_username",
  // Payment instructions shown by the bot
  "payment_note",
];
// Image settings (data URLs), saved with a size cap like the logo.
const IMAGE_KEYS = ["logo", "payment_qr_aba", "payment_qr_acleda"];
// Checkboxes: absent from the form data means "off", so they need explicit handling.
const TOGGLES = ["receipt_show_tagline", "receipt_show_address", "receipt_show_phone", "receipt_show_staff"];

/** Generate a sample QR to verify KHQR / PayWay settings are working. */
export async function testKhqrAction(): Promise<{ ok: boolean; message: string; image?: string }> {
  requireModule("settings");
  return testKhqr();
}

/** Send a test message to the shop's Telegram to verify the bot config. */
export async function testTelegramAction(): Promise<{ ok: boolean; message: string }> {
  requireModule("settings");
  const res = await sendTelegram("✅ <b>HoshiHits test</b> — your shop's Telegram is connected. New orders will arrive here.");
  return { ok: res.ok, message: res.ok ? "Test message sent — check your Telegram." : res.message ?? "Failed to send." };
}

/** Register the bot webhook so it can chat with customers (order + QR + buttons). */
export async function connectBotAction(): Promise<{ ok: boolean; message: string }> {
  requireModule("settings");
  const base =
    (getDb().prepare("SELECT value FROM settings WHERE key='app_base_url'").get() as { value: string } | undefined)?.value ||
    process.env.APP_BASE_URL ||
    "https://hoshihits.onrender.com";
  const res = await setWebhook(base);
  return { ok: res.ok, message: res.message ?? (res.ok ? "Bot connected." : "Failed.") };
}

export async function saveSettingsAction(formData: FormData) {
  const user = requireModule("settings");
  const db = getDb();
  const up = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)");
  for (const key of KEYS) {
    const v = formData.get(key);
    if (v !== null) up.run(key, String(v).trim());
  }

  // Checkboxes only exist on the Store Profile form; other settings forms (e.g.
  // KHQR) must not silently reset them, so only touch toggles when that form
  // marks itself present.
  if (formData.get("has_toggles")) {
    for (const key of TOGGLES) up.run(key, formData.get(key) ? "1" : "0");
  }

  // Image settings (logo, payment QRs): a downscaled data URL, "" to clear it,
  // or absent to leave unchanged. Capped so a stray upload can't bloat the row.
  for (const key of IMAGE_KEYS) {
    const raw = formData.get(key);
    if (raw === null) continue; // field not on this form — leave as-is
    const v = String(raw).trim();
    if (v === "") up.run(key, "");
    else if (v.startsWith("data:image/") && v.length < 500_000) up.run(key, v);
  }
  audit(user.id, "settings.update", "settings", undefined, [...KEYS, ...IMAGE_KEYS].join(", "));
  revalidatePath("/", "layout"); // branding shows in the shell, so refresh everything
  redirect("/settings");
}

/**
 * Operational tables wiped by a factory reset, children before parents so
 * foreign keys stay satisfied. `users`, `settings` and `ai_usage` are NOT here:
 * staff logins, shop configuration and the AI quota counter all survive.
 */
const RESET_TABLES = [
  "web_order_items", "sale_items", "shipments", "po_items", "tradein_items",
  "web_orders", "preorders", "sales", "tradeins", "purchase_orders",
  "expenses", "tournaments", "products", "customers", "suppliers",
  "audit_log",
];

/**
 * Owner-only factory reset: erase all trading data for a fresh start.
 * Requires typing ERASE to guard against a mis-click.
 */
export async function resetDataAction(formData: FormData) {
  const user = requireModule("settings"); // settings is OWNER-only
  if (user.role !== "OWNER") redirect("/dashboard");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "ERASE") {
    redirect("/settings?reset=badconfirm");
  }

  const db = getDb();
  db.transaction(() => {
    for (const table of RESET_TABLES) db.prepare(`DELETE FROM ${table}`).run();
    // Restart id numbering so the fresh store begins at 1 again.
    try {
      db.prepare(
        `DELETE FROM sqlite_sequence WHERE name IN (${RESET_TABLES.map(() => "?").join(",")})`
      ).run(...RESET_TABLES);
    } catch { /* sqlite_sequence only exists once an AUTOINCREMENT table has rows */ }
  })();

  // Written after the wipe so the reset itself is on record.
  audit(user.id, "settings.reset_data", "settings", undefined, `Erased: ${RESET_TABLES.join(", ")}`);
  revalidatePath("/", "layout");
  redirect("/settings?reset=done");
}
