"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";
import { hashPassword } from "@/lib/hash";

const ROLES = ["OWNER", "MANAGER", "CASHIER", "INVENTORY", "ACCOUNTANT"];

export async function saveEmployeeAction(formData: FormData) {
  const me = requireModule("employees");
  const db = getDb();
  const id = Number(formData.get("id") || 0);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "CASHIER");
  const password = String(formData.get("password") ?? "");

  if (!name || !email) throw new Error("Name and email are required.");
  if (!ROLES.includes(role)) throw new Error("Invalid role.");

  const clash = db.prepare("SELECT id FROM users WHERE lower(email)=? AND id != ?").get(email, id) as { id: number } | undefined;
  if (clash) throw new Error("That email is already in use.");

  if (id) {
    if (password) {
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");
      db.prepare("UPDATE users SET name=?, email=?, role=?, password_hash=? WHERE id=?").run(name, email, role, hashPassword(password), id);
    } else {
      db.prepare("UPDATE users SET name=?, email=?, role=? WHERE id=?").run(name, email, role, id);
    }
    audit(me.id, "employees.update", "user", id, `${name} (${role})`);
  } else {
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const r = db
      .prepare("INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?,?,?,?,1,?)")
      .run(name, email, hashPassword(password), role, ts());
    audit(me.id, "employees.create", "user", Number(r.lastInsertRowid), `${name} (${role})`);
  }
  revalidatePath("/employees");
  redirect("/employees");
}

export async function toggleEmployeeAction(formData: FormData) {
  const me = requireModule("employees");
  const db = getDb();
  const id = Number(formData.get("id"));
  if (id === me.id) throw new Error("You cannot disable your own account.");
  const u = db.prepare("SELECT name, active FROM users WHERE id=?").get(id) as { name: string; active: number } | undefined;
  if (!u) throw new Error("User not found.");
  db.prepare("UPDATE users SET active=? WHERE id=?").run(u.active ? 0 : 1, id);
  audit(me.id, u.active ? "employees.disable" : "employees.enable", "user", id, u.name);
  revalidatePath("/employees");
  redirect("/employees");
}
