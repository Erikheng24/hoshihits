"use server";

import { redirect } from "next/navigation";
import { getDb, audit, ts, needsSetup } from "@/lib/db";
import { hashPassword } from "@/lib/hash";
import { setSessionCookie } from "@/lib/auth";

export interface SetupState {
  error?: string;
}

/**
 * One-time creation of the first OWNER account.
 * Only ever runs while the users table is empty, so it can't be used to
 * mint extra owners once the shop is live.
 */
export async function createOwnerAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  if (!needsSetup()) return { error: "Setup has already been completed. Please sign in." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!name) return { error: "Enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const db = getDb();
  const r = db
    .prepare("INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?,?,?,'OWNER',1,?)")
    .run(name, email, hashPassword(password), ts());
  const id = Number(r.lastInsertRowid);

  audit(id, "setup.owner_created", "user", id, email);
  setSessionCookie({ id, name, email, role: "OWNER" });
  redirect("/dashboard");
}
