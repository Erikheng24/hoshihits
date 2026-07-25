"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export async function saveSupplierAction(formData: FormData) {
  const user = requireModule("suppliers");
  const db = getDb();
  const id = Number(formData.get("id") || 0);
  const f = {
    name: String(formData.get("name") ?? "").trim(),
    contact: String(formData.get("contact") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    country: String(formData.get("country") ?? "").trim() || null,
    games: String(formData.get("games") ?? "").trim() || null,
  };
  if (!f.name) throw new Error("Supplier name is required.");

  // Positional params only — libsql's Turso write-forwarding binds @named to NULL.
  if (id) {
    db.prepare("UPDATE suppliers SET name=?, contact=?, email=?, phone=?, country=?, games=? WHERE id=?")
      .run(f.name, f.contact, f.email, f.phone, f.country, f.games, id);
    audit(user.id, "suppliers.update", "supplier", id, f.name);
  } else {
    const r = db
      .prepare("INSERT INTO suppliers (name, contact, email, phone, country, games, created_at) VALUES (?,?,?,?,?,?,?)")
      .run(f.name, f.contact, f.email, f.phone, f.country, f.games, ts());
    audit(user.id, "suppliers.create", "supplier", Number(r.lastInsertRowid), f.name);
  }
  revalidatePath("/suppliers");
  redirect("/suppliers");
}
