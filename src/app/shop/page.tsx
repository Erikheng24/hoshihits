import { getDb } from "@/lib/db";
import { getBranding } from "@/lib/branding";
import { telegramConfigured } from "@/lib/providers/telegram";
import { ShopClient, type ShopProduct } from "./ShopClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shop — HoshiHits" };

/**
 * Public storefront (no login). Customers browse products, build a cart, and
 * place an order that reaches the shop over Telegram.
 */
export default function ShopPage() {
  const db = getDb();
  // Newest first; include sold-out so the shop still shows what it carries.
  const products = db
    .prepare(
      `SELECT id, name, game, category, set_name, rarity, condition, grade_company, grade, price, stock,
              image, image2, image3, description
       FROM products WHERE active = 1 ORDER BY id DESC`
    )
    .all() as ShopProduct[];

  const brand = getBranding();
  const setting = (k: string) =>
    (db.prepare("SELECT value FROM settings WHERE key=?").get(k) as { value: string } | undefined)?.value ?? "";

  return (
    <ShopClient
      products={products}
      shopName={brand.name}
      tagline={brand.tagline}
      logo={brand.logo}
      welcome={setting("shop_welcome")}
      phone={setting("store_phone")}
      address={setting("store_address")}
      telegramUser={setting("telegram_admin_username").replace(/^@/, "")}
      telegramReady={telegramConfigured()}
    />
  );
}
