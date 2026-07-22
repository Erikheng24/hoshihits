"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export async function saveCustomerAction(formData: FormData) {
  const user = requireModule("customers");
  const db = getDb();
  const id = Number(formData.get("id") || 0);
  const returnTo = String(formData.get("returnTo") || "/customers");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!name) throw new Error("Customer name is required.");

  if (id) {
    db.prepare("UPDATE customers SET name=?, phone=?, email=?, notes=? WHERE id=?").run(name, phone, email, notes, id);
    audit(user.id, "customers.update", "customer", id, name);
  } else {
    const r = db
      .prepare("INSERT INTO customers (name, phone, email, notes, created_at) VALUES (?,?,?,?,?)")
      .run(name, phone, email, notes, ts());
    audit(user.id, "customers.create", "customer", Number(r.lastInsertRowid), name);
  }
  revalidatePath("/customers");
  redirect(returnTo);
}
