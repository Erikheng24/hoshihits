"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

const PATHS = ["/inventory", "/singles", "/graded", "/pos", "/dashboard"];
function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

function toCents(v: FormDataEntryValue | null): number {
  return Math.round((parseFloat(String(v ?? "0")) || 0) * 100);
}

export async function saveProductAction(formData: FormData) {
  const user = requireModule("inventory");
  const db = getDb();
  const id = Number(formData.get("id") || 0);
  const returnTo = String(formData.get("returnTo") || "/inventory");

  // Photo: a data URL (upload / camera crop) or an https URL (PSA/UPC artwork).
  // "" = leave the stored photo untouched; "__clear__" = remove it.
  const rawImage = String(formData.get("image") ?? "");
  const clearImage = rawImage === "__clear__";
  const isDataImg = rawImage.startsWith("data:image/") && rawImage.length < 1_400_000;
  const isHttpsImg = /^https:\/\/[^\s"'<>]+$/.test(rawImage) && rawImage.length < 600;
  const image = isDataImg || isHttpsImg ? rawImage : null;

  const fields = {
    name: String(formData.get("name") ?? "").trim(),
    game: String(formData.get("game") ?? "").trim() || "Accessories",
    category: String(formData.get("category") ?? "sealed"),
    set_name: String(formData.get("set_name") ?? "").trim() || null,
    rarity: String(formData.get("rarity") ?? "").trim() || null,
    condition: String(formData.get("condition") ?? "").trim() || null,
    language: String(formData.get("language") ?? "EN").trim() || "EN",
    foil: formData.get("foil") ? 1 : 0,
    grade_company: String(formData.get("grade_company") ?? "").trim() || null,
    grade: String(formData.get("grade") ?? "").trim() || null,
    cert_number: String(formData.get("cert_number") ?? "").trim() || null,
    barcode: String(formData.get("barcode") ?? "").trim() || null,
    price: toCents(formData.get("price")),
    cost: toCents(formData.get("cost")),
    stock: Math.max(0, Math.round(Number(formData.get("stock") ?? 0))),
    low_stock: Math.max(0, Math.round(Number(formData.get("low_stock") ?? 4))),
  };

  if (!fields.name) throw new Error("Product name is required.");
  if (!["sealed", "single", "graded", "accessory"].includes(fields.category)) throw new Error("Invalid category.");
  if (fields.price < 0 || fields.cost < 0) throw new Error("Invalid price.");

  if (id) {
    // Only touch the stored image when a new one was supplied, or it was explicitly cleared.
    if (image || clearImage) {
      db.prepare(
        `UPDATE products SET name=@name, game=@game, category=@category, set_name=@set_name, rarity=@rarity,
          condition=@condition, language=@language, foil=@foil, grade_company=@grade_company, grade=@grade,
          cert_number=@cert_number, barcode=@barcode, image=@image, price=@price, cost=@cost, stock=@stock, low_stock=@low_stock
         WHERE id=@id`
      ).run({ ...fields, image: clearImage ? null : image, id });
    } else {
      db.prepare(
        `UPDATE products SET name=@name, game=@game, category=@category, set_name=@set_name, rarity=@rarity,
          condition=@condition, language=@language, foil=@foil, grade_company=@grade_company, grade=@grade,
          cert_number=@cert_number, barcode=@barcode, price=@price, cost=@cost, stock=@stock, low_stock=@low_stock
         WHERE id=@id`
      ).run({ ...fields, id });
    }
    audit(user.id, "inventory.update", "product", id, fields.name);
  } else {
    const code =
      { "Pokémon": "PKM", "One Piece": "OPC", "Yu-Gi-Oh!": "YGO", "Weiss Schwarz": "WSC", "Union Arena": "UNA",
        Magic: "MTG", Digimon: "DGM", "Dragon Ball": "DBS", Gundam: "GCG", Accessories: "ACC" }[fields.game] ?? "GEN";
    const n = (db.prepare("SELECT COUNT(*) c FROM products").get() as { c: number }).c + 1;
    const sku = `${code}-${String(n).padStart(4, "0")}`;
    const r = db
      .prepare(
        `INSERT INTO products (sku, barcode, name, game, category, set_name, rarity, condition, language, foil,
          grade_company, grade, cert_number, image, price, cost, stock, low_stock, active, created_at)
         VALUES (@sku, @barcode, @name, @game, @category, @set_name, @rarity, @condition, @language, @foil,
          @grade_company, @grade, @cert_number, @image, @price, @cost, @stock, @low_stock, 1, @created_at)`
      )
      .run({ ...fields, image, sku, created_at: ts() });
    audit(user.id, "inventory.create", "product", Number(r.lastInsertRowid), fields.name);
  }

  revalidateAll();
  redirect(returnTo);
}

export async function adjustStockAction(formData: FormData) {
  const user = requireModule("inventory");
  const db = getDb();
  const id = Number(formData.get("id"));
  const delta = Math.round(Number(formData.get("delta") ?? 0));
  const returnTo = String(formData.get("returnTo") || "/inventory");
  const p = db.prepare("SELECT name, stock FROM products WHERE id=?").get(id) as { name: string; stock: number } | undefined;
  if (!p) throw new Error("Product not found.");
  const next = Math.max(0, p.stock + delta);
  db.prepare("UPDATE products SET stock=? WHERE id=?").run(next, id);
  audit(user.id, "inventory.adjust", "product", id, `${p.name}: ${p.stock} → ${next}`);
  revalidateAll();
  redirect(returnTo);
}

export async function archiveProductAction(formData: FormData) {
  const user = requireModule("inventory");
  const db = getDb();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("returnTo") || "/inventory");
  const p = db.prepare("SELECT name FROM products WHERE id=?").get(id) as { name: string } | undefined;
  if (!p) throw new Error("Product not found.");
  db.prepare("UPDATE products SET active=0 WHERE id=?").run(id);
  audit(user.id, "inventory.archive", "product", id, p.name);
  revalidateAll();
  redirect(returnTo);
}
