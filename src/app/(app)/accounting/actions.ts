"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, ts, today } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export async function addExpenseAction(formData: FormData) {
  const user = requireModule("accounting");
  const db = getDb();
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const amount = Math.round((parseFloat(String(formData.get("amount") ?? "0")) || 0) * 100);
  const date = String(formData.get("date") ?? "").trim() || today();
  if (!category) throw new Error("Category is required.");
  if (amount <= 0) throw new Error("Amount must be positive.");

  const r = db
    .prepare("INSERT INTO expenses (category, description, amount, date, user_id, created_at) VALUES (?,?,?,?,?,?)")
    .run(category, description, amount, date, user.id, ts());
  audit(user.id, "accounting.expense", "expense", Number(r.lastInsertRowid), `${category} ${(amount / 100).toFixed(2)}`);
  revalidatePath("/accounting");
  redirect("/accounting");
}

export async function deleteExpenseAction(formData: FormData) {
  const user = requireModule("accounting");
  const db = getDb();
  const id = Number(formData.get("id"));
  const e = db.prepare("SELECT category, amount FROM expenses WHERE id=?").get(id) as { category: string; amount: number } | undefined;
  if (!e) throw new Error("Expense not found.");
  db.prepare("DELETE FROM expenses WHERE id=?").run(id);
  audit(user.id, "accounting.expense_delete", "expense", id, `${e.category} ${(e.amount / 100).toFixed(2)}`);
  revalidatePath("/accounting");
  redirect("/accounting");
}
