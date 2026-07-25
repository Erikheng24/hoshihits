"use server";

import { revalidatePath } from "next/cache";
import { getDb, audit } from "@/lib/db";
import { requireModule } from "@/lib/auth";

const STATUSES = ["new", "contacted", "paid", "fulfilled", "cancelled"];

export async function setWebOrderStatusAction(formData: FormData) {
  const user = requireModule("web-orders");
  const db = getDb();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status)) throw new Error("Invalid status.");
  const o = db.prepare("SELECT number FROM web_orders WHERE id = ?").get(id) as { number: string } | undefined;
  if (!o) throw new Error("Order not found.");
  db.prepare("UPDATE web_orders SET status = ? WHERE id = ?").run(status, id);
  audit(user.id, "web_orders.status", "web_order", id, `${o.number} → ${status}`);
  revalidatePath("/web-orders");
}
