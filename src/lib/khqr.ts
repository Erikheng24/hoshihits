import "server-only";
// bakong-khqr builds the EMVCo/KHQR string + md5; qrcode renders it to an image.
import pkg from "bakong-khqr";
import QRCode from "qrcode";
import { getDb } from "./db";

const { BakongKHQR, IndividualInfo, khqrData } = pkg as unknown as {
  BakongKHQR: new () => { generateIndividual: (info: unknown) => { status: { code: number; message: string | null }; data: { qr: string; md5: string } | null } };
  IndividualInfo: new (accountId: string, merchantName: string, city: string, optional: Record<string, unknown>) => unknown;
  khqrData: { currency: { usd: number; khr: number } };
};

export interface KhqrConfig {
  accountId: string;   // Bakong Account ID, e.g. "sokheng@aclb" — the QR pays into this
  merchantName: string;
  city: string;
  phone?: string;
  token?: string;      // Bakong Open API token, for auto-detecting payment
}

/** KHQR / Bakong configuration, from Settings (falls back to env). */
export function getKhqrConfig(): KhqrConfig {
  const rows = getDb()
    .prepare(
      "SELECT key, value FROM settings WHERE key IN ('khqr_account_id','khqr_merchant_name','khqr_city','khqr_phone','bakong_api_token')"
    )
    .all() as { key: string; value: string }[];
  const m = new Map(rows.map((r) => [r.key, (r.value ?? "").trim()]));
  const merchant = m.get("khqr_merchant_name") || process.env.KHQR_MERCHANT_NAME || "HoshiHits";
  return {
    accountId: m.get("khqr_account_id") || process.env.KHQR_ACCOUNT_ID || "",
    merchantName: merchant.slice(0, 25), // EMVCo max lengths
    city: (m.get("khqr_city") || process.env.KHQR_CITY || "Phnom Penh").slice(0, 15),
    phone: m.get("khqr_phone") || process.env.KHQR_PHONE || "",
    token: m.get("bakong_api_token") || process.env.BAKONG_API_TOKEN || "",
  };
}

/** True when a Bakong Account ID is set — enough to show a QR (payment check needs the token too). */
export function khqrConfigured(): boolean {
  return !!getKhqrConfig().accountId;
}

export interface GeneratedKhqr {
  ok: boolean;
  qr?: string;
  md5?: string;
  image?: string; // data URL
  message?: string;
}

/**
 * Build a dynamic KHQR for an exact amount. `ref` is the bill number printed in
 * the QR so a payment can be reconciled; it expires after `ttlMinutes`.
 */
export async function generateKhqr(amountCents: number, ref: string, ttlMinutes = 6): Promise<GeneratedKhqr> {
  const cfg = getKhqrConfig();
  if (!cfg.accountId) {
    return { ok: false, message: "KHQR isn't set up — add your Bakong Account ID in Settings." };
  }
  try {
    const info = new IndividualInfo(cfg.accountId, cfg.merchantName, cfg.city, {
      currency: khqrData.currency.usd,
      amount: Number((amountCents / 100).toFixed(2)),
      billNumber: ref,
      mobileNumber: cfg.phone || undefined,
      storeLabel: cfg.merchantName,
      terminalLabel: "POS",
      expirationTimestamp: Date.now() + ttlMinutes * 60 * 1000,
    });
    const res = new BakongKHQR().generateIndividual(info);
    if (res.status?.code !== 0 || !res.data?.qr) {
      return { ok: false, message: res.status?.message || "Couldn't create the payment QR." };
    }
    const image = await QRCode.toDataURL(res.data.qr, { margin: 1, width: 720, errorCorrectionLevel: "M" });
    return { ok: true, qr: res.data.qr, md5: res.data.md5, image };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "KHQR generation failed." };
  }
}
