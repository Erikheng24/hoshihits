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

  if (id) {
    db.prepare("UPDATE suppliers SET name=@name, contact=@contact, email=@email, phone=@phone, country=@country, games=@games WHERE id=@id")
      .run({ ...f, id });
    audit(user.id, "suppliers.update", "supplier", id, f.name);
  } else {
    const r = db
      .prepare("INSERT INTO suppliers (name, contact, email, phone, country, games, created_at) VALUES (@name,@contact,@email,@phone,@country,@games,@created_at)")
      .run({ ...f, created_at: ts() });
    audit(user.id, "suppliers.create", "supplier", Number(r.lastInsertRowid), f.name);
  }
  revalidatePath("/suppliers");
  redirect("/suppliers");
}
