import { money } from "./format";

export type DiscountType = "amount" | "percent" | "";

/** Store-wide sale (applies to items that don't carry their own discount). */
export interface StoreDiscount {
  type: DiscountType;
  value: number; // cents (amount) or whole percent (percent)
}

export interface Priced {
  price: number; // original, cents
  discount_type?: string | null;
  discount_value?: number | null;
}

export interface PriceResult {
  original: number; // cents
  sale: number; // cents (== original when nothing applies)
  off: number; // cents saved
  onSale: boolean;
  badge: string; // e.g. "-15%" or "-$5.00"
}

/**
 * Resolve the effective web-shop price for a product. A product's own discount
 * wins; otherwise the store-wide sale (if any) applies. Percent is capped at 90%
 * and the sale price never goes below $0 or above the original.
 */
export function priceOf(p: Priced, store?: StoreDiscount | null): PriceResult {
  let type = (p.discount_type as DiscountType) || "";
  let value = p.discount_value ?? 0;
  if ((!type || value <= 0) && store && store.type && store.value > 0) {
    type = store.type;
    value = store.value;
  }
  if (!type || value <= 0) return { original: p.price, sale: p.price, off: 0, onSale: false, badge: "" };

  let sale = p.price;
  let badge = "";
  if (type === "percent") {
    const pct = Math.max(0, Math.min(90, Math.round(value)));
    sale = Math.round((p.price * (100 - pct)) / 100);
    badge = `-${pct}%`;
  } else {
    const amt = Math.max(0, Math.round(value));
    sale = Math.max(0, p.price - amt);
    badge = `-${money(amt)}`;
  }
  sale = Math.max(0, Math.min(sale, p.price));
  if (sale >= p.price) return { original: p.price, sale: p.price, off: 0, onSale: false, badge: "" };
  return { original: p.price, sale, off: p.price - sale, onSale: true, badge };
}

/** Build a StoreDiscount from raw settings values (amount stored as dollars). */
export function storeDiscountFrom(type: string, rawValue: string): StoreDiscount {
  const t = (type === "amount" || type === "percent" ? type : "") as DiscountType;
  if (!t) return { type: "", value: 0 };
  const n = parseFloat(rawValue || "0") || 0;
  const value = t === "amount" ? Math.round(n * 100) : Math.round(n);
  return { type: t, value: Math.max(0, value) };
}
