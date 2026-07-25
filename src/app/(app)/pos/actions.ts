"use server";

import { audit } from "@/lib/db";
import { requireModule } from "@/lib/auth";
import {
  checkout,
  startPayment,
  pollPayment,
  cancelPayment,
  manualComplete,
  type CheckoutInput,
  type CheckoutResult,
  type StartPaymentResult,
  type PollResult,
} from "@/lib/payments";

export type { CartLine, CheckoutInput, CheckoutResult } from "@/lib/payments";

/** Cash / card checkout — commits the sale immediately. */
export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  const user = requireModule("pos");
  const result = checkout(input, user.id);
  if (result.ok) audit(user.id, "pos.sale", "sale", result.saleId, `${result.number} — ${input.lines.length} line(s)`);
  return result;
}

/** Start a QR payment (Bakong KHQR or ABA PayWay QR, per settings). */
export async function startKhqrPaymentAction(input: CheckoutInput): Promise<StartPaymentResult> {
  const user = requireModule("pos");
  const res = await startPayment({ ...input, method: "qr" }, user.id, "qr");
  if (res.ok) audit(user.id, "pos.qr_start", "payment", res.paymentId, `${res.provider} ${res.ref} — ${(res.amount ?? 0) / 100} USD`);
  return res;
}

/** Start an ABA PayWay card payment: opens the hosted checkout. */
export async function startCardPaymentAction(input: CheckoutInput): Promise<StartPaymentResult> {
  const user = requireModule("pos");
  const res = await startPayment({ ...input, method: "card" }, user.id, "card");
  if (res.ok) audit(user.id, "pos.card_start", "payment", res.paymentId, `payway ${res.ref} — ${(res.amount ?? 0) / 100} USD`);
  return res;
}

/** Poll a KHQR payment; commits the sale when Bakong confirms it's paid. */
export async function pollKhqrPaymentAction(paymentId: number): Promise<PollResult> {
  requireModule("pos");
  return pollPayment(paymentId);
}

/** Cancel a still-pending KHQR payment. */
export async function cancelKhqrPaymentAction(paymentId: number): Promise<{ ok: true }> {
  const user = requireModule("pos");
  cancelPayment(paymentId);
  audit(user.id, "pos.khqr_cancel", "payment", paymentId, "cancelled");
  return { ok: true };
}

/** Manually complete a pending payment (fallback when auto-detect is unavailable). */
export async function manualCompletePaymentAction(paymentId: number): Promise<PollResult> {
  const user = requireModule("pos");
  const res = manualComplete(paymentId, user.id);
  if (res.status === "paid") audit(user.id, "pos.khqr_manual", "payment", paymentId, `manual complete → sale ${res.saleId}`);
  return res;
}
