import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { storeDiscountFrom } from "@/lib/pricing";
import { ShopClient, type ShopProduct } from "./ShopClient";

export const dynamic = "force-dynamic";

/** Rich link preview when the shop URL is shared on Telegram / Facebook / etc. */
export async function generateMetadata(): Promise<Metadata> {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings WHERE key IN ('store_name','store_tagline','shop_welcome','app_base_url')")
    .all() as { key: string; value: string }[];
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const name = (m.get("store_name") || "HoshiHits").trim();
  const desc = (m.get("shop_welcome") || m.get("store_tagline") ||
    "Authentic Pokémon & One Piece trading cards — singles, booster boxes & PSA graded slabs. Order easily on Telegram.").trim();
  const base = (m.get("app_base_url") || "https://hoshihits-production-96ce.up.railway.app").replace(/\/+$/, "");
  const title = `${name} — TCG Card Shop`;
  return {
    metadataBase: new URL(base),
    title,
    description: desc,
    openGraph: {
      title, description: desc, url: `${base}/shop`, siteName: name, type: "website",
      images: [{ url: `${base}/og.png`, width: 1200, height: 630, alt: name }],
    },
    twitter: { card: "summary_large_image", title, description: desc, images: [`${base}/og.png`] },
  };
}

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
              (image IS NOT NULL AND image != '') AS has_image, discount_type, discount_value
       FROM products WHERE active = 1 ORDER BY id DESC`
    )
    .all() as ShopProduct[];

  // Load ALL settings in ONE query (not ~20 separate reads). On a remote-read
  // DB connection each query is a network round-trip, so batching turns a ~37s
  // page into ~2s.
  const settingsRows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const S = new Map(settingsRows.map((r) => [r.key, r.value]));
  const setting = (k: string) => S.get(k) ?? "";
  const brand = {
    name: (setting("store_name") || "HoshiHits").trim(),
    tagline: (setting("store_tagline") || "Card Shop ERP").trim(),
    logo: setting("logo").startsWith("data:image/") ? setting("logo") : null,
  };

  // Build each hero slide's collage from the shop's OWN product photos — real,
  // owned inventory (no third-party artwork). In-stock first, then anything.
  const withImg = products.filter((p) => p.has_image);
  const pickIds = (pred: (p: ShopProduct) => boolean, n = 4): number[] => {
    const hit = withImg.filter(pred);
    const ranked = [...hit.filter((p) => p.stock > 0), ...hit.filter((p) => p.stock <= 0)];
    const out = ranked.slice(0, n).map((p) => p.id);
    // Fall back to any product photos so a themed slide is never empty.
    if (out.length < 2) out.push(...withImg.slice(0, n - out.length).map((p) => p.id));
    return out.slice(0, n);
  };
  const slideImages: Record<string, number[]> = {
    pokemon: pickIds((p) => /pok[eé]?mon/i.test(p.game)),
    onepiece: pickIds((p) => /one[\s-]?piece/i.test(p.game)),
    accessory: pickIds((p) => p.category === "accessory" || p.category === "sealed"),
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
      telegramReady={!!((setting("telegram_bot_token") || process.env.TELEGRAM_BOT_TOKEN) && (setting("telegram_admin_chat_id") || process.env.TELEGRAM_ADMIN_CHAT_ID))}
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
