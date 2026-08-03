import { getDb } from "@/lib/db";
import { getBranding } from "@/lib/branding";
import { telegramConfigured } from "@/lib/providers/telegram";
import { storeDiscountFrom } from "@/lib/pricing";
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
              image, image2, image3, description, discount_type, discount_value
       FROM products WHERE active = 1 ORDER BY id DESC`
    )
    .all() as ShopProduct[];

  const brand = getBranding();
  const setting = (k: string) =>
    (db.prepare("SELECT value FROM settings WHERE key=?").get(k) as { value: string } | undefined)?.value ?? "";

  // Build each hero slide's collage from the shop's OWN product photos — real,
  // owned inventory (no third-party artwork). In-stock first, then anything.
  const withImg = products.filter((p) => p.image);
  const pickImgs = (pred: (p: ShopProduct) => boolean, n = 4): string[] => {
    const hit = withImg.filter(pred);
    const ranked = [...hit.filter((p) => p.stock > 0), ...hit.filter((p) => p.stock <= 0)];
    const out = ranked.slice(0, n).map((p) => p.image!);
    // Fall back to any product photos so a themed slide is never empty.
    if (out.length < 2) out.push(...withImg.slice(0, n - out.length).map((p) => p.image!));
    return out.slice(0, n);
  };
  const slideImages: Record<string, string[]> = {
    pokemon: pickImgs((p) => /pok[eé]?mon/i.test(p.game)),
    onepiece: pickImgs((p) => /one[\s-]?piece/i.test(p.game)),
    accessory: pickImgs((p) => p.category === "accessory" || p.category === "sealed"),
  };
  // Owner-uploaded poster per slide (Settings). Empty → the collage above shows.
  const poster = (k: string) => (setting(k).startsWith("data:image/") ? setting(k) : "");
  const slidePosters: Record<string, string> = {
    pokemon: poster("slide_pokemon_img"),
    onepiece: poster("slide_onepiece_img"),
    accessory: poster("slide_accessory_img"),
  };

  return (
    <ShopClient
      products={products}
      slideImages={slideImages}
      slidePosters={slidePosters}
      shopName={brand.name}
      tagline={brand.tagline}
      logo={brand.logo}
      welcome={setting("shop_welcome")}
      phone={setting("store_phone")}
      address={setting("store_address")}
      telegramUser={setting("telegram_admin_username").replace(/^@/, "")}
      telegramReady={telegramConfigured()}
      storeDiscount={storeDiscountFrom(setting("store_discount_type"), setting("store_discount_value"))}
      facebook={setting("shop_facebook")}
      channel={setting("shop_telegram_channel")}
      instagram={setting("shop_instagram")}
      messenger={setting("shop_messenger")}
      telegramOrder={setting("shop_telegram_order")}
      adminUser={setting("telegram_admin_username").replace(/^@/, "")}
      bgImage={setting("shop_bg_image").startsWith("data:image/") ? setting("shop_bg_image") : ""}
      promo={{
        title: setting("promo_title"),
        text: setting("promo_text"),
        cta: setting("promo_cta"),
        link: setting("promo_link"),
        image: setting("promo_image"),
      }}
    />
  );
}
