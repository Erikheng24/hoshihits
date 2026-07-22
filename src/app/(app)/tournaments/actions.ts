"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit, ts } from "@/lib/db";
import { requireModule } from "@/lib/auth";

export async function createTournamentAction(formData: FormData) {
  const user = requireModule("tournaments");
  const db = getDb();
  const name = String(formData.get("name") ?? "").trim();
  const game = String(formData.get("game") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim() || null;
  const entryFee = Math.round((parseFloat(String(formData.get("entry_fee") ?? "0")) || 0) * 100);
  const capacity = Math.max(2, Math.round(Number(formData.get("capacity") ?? 16)));
  const prize = String(formData.get("prize") ?? "").trim() || null;
  if (!name || !game || !date) throw new Error("Name, game, and date are required.");

  const r = db
    .prepare("INSERT INTO tournaments (name, game, date, time, entry_fee, capacity, registered, prize, status, created_at) VALUES (?,?,?,?,?,?,0,?,'upcoming',?)")
    .run(name, game, date, time, entryFee, capacity, prize, ts());
  audit(user.id, "tournaments.create", "tournament", Number(r.lastInsertRowid), name);
  revalidatePath("/tournaments");
  redirect("/tournaments");
}

export async function adjustRegistrationAction(formData: FormData) {
  const user = requireModule("tournaments");
  const db = getDb();
  const id = Number(formData.get("id"));
  const delta = Math.round(Number(formData.get("delta") ?? 0));
  const t = db.prepare("SELECT name, registered, capacity, status FROM tournaments WHERE id=?").get(id) as any;
  if (!t) throw new Error("Tournament not found.");
  if (t.status !== "upcoming") throw new Error("Registration is closed.");
  const next = Math.max(0, Math.min(t.capacity, t.registered + delta));
  db.prepare("UPDATE tournaments SET registered=? WHERE id=?").run(next, id);
  audit(user.id, "tournaments.registration", "tournament", id, `${t.name}: ${t.registered} → ${next}`);
  revalidatePath("/tournaments");
  redirect("/tournaments");
}

export async function setTournamentStatusAction(formData: FormData) {
  const user = requireModule("tournaments");
  const db = getDb();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["completed", "cancelled"].includes(status)) throw new Error("Invalid status.");
  const t = db.prepare("SELECT name FROM tournaments WHERE id=?").get(id) as any;
  if (!t) throw new Error("Tournament not found.");
  db.prepare("UPDATE tournaments SET status=? WHERE id=?").run(status, id);
  audit(user.id, "tournaments.status", "tournament", id, `${t.name} → ${status}`);
  revalidatePath("/tournaments");
  redirect("/tournaments");
}
