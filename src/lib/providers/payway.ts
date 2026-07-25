import "server-only";
import crypto from "crypto";
import { getDb } from "@/lib/db";

/**
 * ABA PayWay payment gateway.
 *
 * Two flows share one signed "purchase" request:
 *  - QR   : payment_option "abapay_khqr_deeplink" returns a KHQR string we show
 *           on the customer display (ABA Pay + KHQR), settled to the ABA
 *           merchant account.
 *  - Card : the hosted checkout page (Visa/Mastercard/UnionPay), reached by
 *           auto-submitting the same signed fields as a form.
 *
 * Payment status is polled with check-transaction-2. Every request is signed
 * Base64(HMAC-SHA512(concatenated-fields, api_key)) — the field ORDER is fixed
 * by ABA and must match exactly, so both the request and the hash are built
 * from one ordered list.
 *
 * Docs: developer.payway.com.kh (Purchase, Check transaction).
 */

export interface PaywayConfig {
  merchantId: string;
  apiKey: string;
  sandbox: boolean;
  baseUrl: string;      // gateway base, chosen by sandbox flag
  siteUrl: string;      // our public URL, for return/continue redirects
  useForQr: boolean;    // route the POS "QR" button through PayWay
}

export function getPaywayConfig(): PaywayConfig {
  const rows = getDb()
    .prepare(
      "SELECT key, value FROM settings WHERE key IN ('payway_merchant_id','payway_api_key','payway_sandbox','payway_qr','app_base_url')"
    )
    .all() as { key: string; value: string }[];
  const m = new Map(rows.map((r) => [r.key, (r.value ?? "").trim()]));
  const sandbox = (m.get("payway_sandbox") ?? "1") !== "0"; // default to sandbox until they flip it live
  return {
    merchantId: m.get("payway_merchant_id") || process.env.PAYWAY_MERCHANT_ID || "",
    apiKey: m.get("payway_api_key") || process.env.PAYWAY_API_KEY || "",
    sandbox,
    baseUrl: sandbox ? "https://checkout-sandbox.payway.com.kh" : "https://checkout.payway.com.kh",
    siteUrl: (m.get("app_base_url") || process.env.APP_BASE_URL || "https://hoshihits.onrender.com").replace(/\/+$/, ""),
    useForQr: (m.get("payway_qr") ?? "0") === "1",
  };
}

export function paywayConfigured(): boolean {
  const c = getPaywayConfig();
  return !!c.merchantId && !!c.apiKey;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** UTC timestamp YYYYMMDDHHmmss, as PayWay requires. */
function reqTime(): string {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function sign(concat: string, apiKey: string): string {
  return crypto.createHmac("sha512", apiKey).update(concat, "utf8").digest("base64");
}

// Purchase field order, exactly as ABA concatenates them for the hash.
const PURCHASE_ORDER = [
  "req_time", "merchant_id", "tran_id", "amount", "items", "shipping", "firstname", "lastname",
  "email", "phone", "type", "payment_option", "return_url", "cancel_url", "continue_success_url",
  "return_deeplink", "currency", "custom_fields", "return_params", "payout", "lifetime",
  "additional_params", "google_pay_token", "skip_success_page",
] as const;

type PurchaseFields = Partial<Record<(typeof PURCHASE_ORDER)[number], string>>;

/** Build the full signed purchase field set (order-consistent hash + body). */
function buildPurchase(cfg: PaywayConfig, tranId: string, amountCents: number, itemName: string, paymentOption: string): Record<string, string> {
  const items = b64(JSON.stringify([{ name: itemName.slice(0, 60), quantity: 1, price: Number((amountCents / 100).toFixed(2)) }]));
  const fields: PurchaseFields = {
    req_time: reqTime(),
    merchant_id: cfg.merchantId,
    tran_id: tranId,
    amount: (amountCents / 100).toFixed(2),
    items,
    type: "purchase",
    payment_option: paymentOption,
    continue_success_url: b64(`${cfg.siteUrl}/pay/payway/done`),
    return_url: b64(`${cfg.siteUrl}/api/payway/callback`),
    currency: "USD",
    lifetime: "6", // minutes
  };
  const concat = PURCHASE_ORDER.map((k) => fields[k] ?? "").join("");
  const hash = sign(concat, cfg.apiKey);
  // Send the fields we set plus the hash (empty fields may be omitted).
  const body: Record<string, string> = { hash };
  for (const k of PURCHASE_ORDER) if (fields[k] !== undefined) body[k] = fields[k]!;
  return body;
}

export interface PaywayQrResult {
  ok: boolean;
  qrString?: string;
  deeplink?: string;
  checkoutUrl?: string;
  message?: string;
}

/** Create a KHQR/ABA-Pay QR through PayWay (settled to the ABA merchant account). */
export async function paywayCreateQr(tranId: string, amountCents: number, itemName: string): Promise<PaywayQrResult> {
  const cfg = getPaywayConfig();
  if (!paywayConfigured()) return { ok: false, message: "ABA PayWay isn't set up — add your merchant ID and API key in Settings." };

  const body = buildPurchase(cfg, tranId, amountCents, itemName, "abapay_khqr_deeplink");
  const form = new FormData(); // ABA's purchase endpoint expects multipart/form-data
  for (const [k, v] of Object.entries(body)) form.append(k, v);
  try {
    const res = await fetch(`${cfg.baseUrl}/api/payment-gateway/v1/payments/purchase`, {
      method: "POST",
      body: form, // fetch sets the multipart boundary + content-type
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => null)) as
      | { status?: { code?: string | number; message?: string }; qr_string?: string; abapay_deeplink?: string; checkout_qr_url?: string }
      | null;
    if (!data) return { ok: false, message: "PayWay returned an unexpected response." };
    const okCode = String(data.status?.code ?? "") === "00" || Number(data.status?.code) === 0;
    if (!okCode || !data.qr_string) {
      return { ok: false, message: data.status?.message || "PayWay rejected the request — check the merchant ID / API key." };
    }
    return { ok: true, qrString: data.qr_string, deeplink: data.abapay_deeplink, checkoutUrl: data.checkout_qr_url };
  } catch {
    return { ok: false, message: "Couldn't reach ABA PayWay — check the internet connection." };
  }
}

/** The signed fields + action URL for a hosted-checkout (card) auto-submit form. */
export function paywayCardForm(tranId: string, amountCents: number, itemName: string): { action: string; fields: Record<string, string> } | null {
  const cfg = getPaywayConfig();
  if (!paywayConfigured()) return null;
  // Empty payment_option = show all methods (cards + ABA Pay + KHQR) on ABA's page.
  const fields = buildPurchase(cfg, tranId, amountCents, itemName, "cards");
  return { action: `${cfg.baseUrl}/api/payment-gateway/v1/payments/purchase`, fields };
}

export type PaywayStatus = "paid" | "pending" | "failed" | "error";
export interface PaywayCheck {
  status: PaywayStatus;
  message?: string;
}

/** Poll a transaction's status (valid for 7 days after creation). */
export async function paywayCheck(tranId: string): Promise<PaywayCheck> {
  const cfg = getPaywayConfig();
  if (!paywayConfigured()) return { status: "error", message: "ABA PayWay isn't set up." };

  const rt = reqTime();
  const hash = sign(rt + cfg.merchantId + tranId, cfg.apiKey);
  try {
    const res = await fetch(`${cfg.baseUrl}/api/payment-gateway/v1/payments/check-transaction-2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ req_time: rt, merchant_id: cfg.merchantId, tran_id: tranId, hash }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => null)) as
      | { status?: { code?: string; message?: string }; data?: { payment_status?: string; payment_status_code?: number } }
      | null;
    if (!data) return { status: "error", message: "No response from PayWay." };

    const ps = (data.data?.payment_status ?? "").toUpperCase();
    const code = data.data?.payment_status_code;
    if (ps === "APPROVED" || code === 0) return { status: "paid" };
    if (ps === "PENDING" || code === 2 || data.status?.code === "01") return { status: "pending" };
    if (ps === "DECLINED" || ps === "CANCELLED" || code === 3 || code === 7) return { status: "failed", message: ps || "Declined" };
    // Transaction not found yet (just created) reads as pending.
    return { status: "pending" };
  } catch {
    return { status: "error", message: "Couldn't reach ABA PayWay." };
  }
}
