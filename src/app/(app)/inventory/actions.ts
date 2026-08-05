"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, ts, nextSku } from "@/lib/db";
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

  // Extra storefront photos + description.
  const extraImg = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim();
    return s.startsWith("data:image/") && s.length < 900_000 ? s : null;
  };
  const image2 = extraImg(formData.get("image2"));
  const image3 = extraImg(formData.get("image3"));
  const description = String(formData.get("description") ?? "").trim() || null;

  // Web-shop discount: a fixed $ off (stored as cents) or a % off (whole number).
  const dType = String(formData.get("discount_type") ?? "");
  let dVal = 0;
  if (dType === "percent") dVal = Math.max(0, Math.min(90, Math.round(Number(formData.get("discount_value") ?? 0))));
  else if (dType === "amount") dVal = toCents(formData.get("discount_value"));
  const discount_type = (dType === "percent" || dType === "amount") && dVal > 0 ? dType : null;
  const discount_value = discount_type ? dVal : null;

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
    discount_type,
    discount_value,
  };

  if (!fields.name) throw new Error("Product name is required.");
  if (!["sealed", "single", "graded", "accessory"].includes(fields.category)) throw new Error("Invalid category.");
  if (fields.price < 0 || fields.cost < 0) throw new Error("Invalid price.");

  // NOTE: positional (?) parameters only. libsql's Turso write-forwarding
  // (Hrana) binds @named parameters to NULL, so every named write silently
  // failed in production. Keep all writes positional.
  const f = fields;
  if (id) {
    // Only touch the stored image when a new one was supplied, or it was explicitly cleared.
    if (image || clearImage) {
      db.prepare(
        `UPDATE products SET name=?, game=?, category=?, set_name=?, rarity=?,
          condition=?, language=?, foil=?, grade_company=?, grade=?,
          cert_number=?, barcode=?, image=?, image2=?, image3=?, description=?, price=?, cost=?, stock=?, low_stock=?,
          discount_type=?, discount_value=?
         WHERE id=?`
      ).run(
        f.name, f.game, f.category, f.set_name, f.rarity, f.condition, f.language, f.foil,
        f.grade_company, f.grade, f.cert_number, f.barcode, clearImage ? null : image, image2, image3, description,
        f.price, f.cost, f.stock, f.low_stock, f.discount_type, f.discount_value, id
      );
    } else {
      db.prepare(
        `UPDATE products SET name=?, game=?, category=?, set_name=?, rarity=?,
          condition=?, language=?, foil=?, grade_company=?, grade=?,
          cert_number=?, barcode=?, image2=?, image3=?, description=?, price=?, cost=?, stock=?, low_stock=?,
          discount_type=?, discount_value=?
         WHERE id=?`
      ).run(
        f.name, f.game, f.category, f.set_name, f.rarity, f.condition, f.language, f.foil,
        f.grade_company, f.grade, f.cert_number, f.barcode, image2, image3, description, f.price, f.cost, f.stock, f.low_stock,
        f.discount_type, f.discount_value, id
      );
    }
    audit(user.id, "inventory.update", "product", id, fields.name);
  } else {
    const code =
      { "Pokémon": "PKM", "One Piece": "OPC", "Yu-Gi-Oh!": "YGO", "Weiss Schwarz": "WSC", "Union Arena": "UNA",
        Magic: "MTG", Digimon: "DGM", "Dragon Ball": "DBS", Gundam: "GCG", Accessories: "ACC" }[fields.game] ?? "GEN";
    const sku = nextSku(code);
    const r = db
      .prepare(
        `INSERT INTO products (sku, barcode, name, game, category, set_name, rarity, condition, language, foil,
          grade_company, grade, cert_number, image, image2, image3, description, price, cost, stock, low_stock,
          discount_type, discount_value, active, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 1, ?)`
      )
      .run(
        sku, f.barcode, f.name, f.game, f.category, f.set_name, f.rarity, f.condition, f.language, f.foil,
        f.grade_company, f.grade, f.cert_number, image, image2, image3, description, f.price, f.cost, f.stock, f.low_stock,
        f.discount_type, f.discount_value, ts()
      );
    audit(user.id, "inventory.create", "product", Number(r.lastInsertRowid), fields.name);
  }

  revalidateAll();
  redirect(returnTo);
}

/** Is this grading cert already in stock? Used to warn before adding a duplicate slab. */
export async function checkCertAction(
  cert: string,
  excludeId?: number
): Promise<{ exists: boolean; id?: number; sku?: string; name?: string; stock?: number; grade?: string; grade_company?: string }> {
  requireModule("inventory");
  const c = (cert ?? "").trim();
  if (!c) return { exists: false };
  const db = getDb();
  const p = db
    .prepare("SELECT id, sku, name, stock, grade, grade_company FROM products WHERE cert_number = ? AND active = 1 AND id != ? LIMIT 1")
    .get(c, excludeId ?? 0) as { id: number; sku: string; name: string; stock: number; grade: string | null; grade_company: string | null } | undefined;
  return p
    ? { exists: true, id: p.id, sku: p.sku, name: p.name, stock: p.stock, grade: p.grade ?? undefined, grade_company: p.grade_company ?? undefined }
    : { exists: false };
}

/** Quick web-shop discount setter from the inventory list (no full edit form). */
export async function setProductDiscountAction(formData: FormData) {
  const user = requireModule("inventory");
  const db = getDb();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("returnTo") || "/inventory");
  const dType = String(formData.get("discount_type") ?? "");
  let dVal = 0;
  if (dType === "percent") dVal = Math.max(0, Math.min(90, Math.round(Number(formData.get("discount_value") ?? 0))));
  else if (dType === "amount") dVal = toCents(formData.get("discount_value"));
  const discount_type = (dType === "percent" || dType === "amount") && dVal > 0 ? dType : null;
  const discount_value = discount_type ? dVal : null;
  const p = db.prepare("SELECT name FROM products WHERE id=?").get(id) as { name: string } | undefined;
  if (!p) throw new Error("Product not found.");
  db.prepare("UPDATE products SET discount_type=?, discount_value=? WHERE id=?").run(discount_type, discount_value, id);
  audit(user.id, "inventory.discount", "product", id, `${p.name}: ${discount_type ? `${discount_type} ${discount_value}` : "cleared"}`);
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
