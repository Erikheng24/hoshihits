"use server";

import { redirect } from "next/navigation";
import { getDb, audit } from "@/lib/db";
import { verifyPassword } from "@/lib/hash";
import { setSessionCookie, clearSessionCookie, getSession, type Role } from "@/lib/auth";
import { IS_DEMO, DEMO_EMAIL } from "@/lib/demo";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const db = getDb();
  const user = db
    .prepare("SELECT id, name, email, password_hash, role, active FROM users WHERE lower(email) = ?")
    .get(email) as { id: number; name: string; email: string; password_hash: string; role: Role; active: number } | undefined;

  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    audit(user?.id ?? null, "auth.login_failed", "user", user?.id, email);
    return { error: "Invalid credentials. Check your email and password." };
  }

  setSessionCookie({ id: user.id, name: user.name, email: user.email, role: user.role });
  audit(user.id, "auth.login", "user", user.id);
  redirect("/dashboard");
}

/** One-click sign-in as the demo owner (only on the demo/sandbox deployment). */
export async function enterDemoAction() {
  if (!IS_DEMO) redirect("/login");
  const db = getDb();
  const user = db
    .prepare("SELECT id, name, email, role FROM users WHERE lower(email) = ?")
    .get(DEMO_EMAIL) as { id: number; name: string; email: string; role: Role } | undefined;
  if (!user) redirect("/login");
  setSessionCookie({ id: user.id, name: user.name, email: user.email, role: user.role });
  redirect("/dashboard");
}

export async function logoutAction() {
  const s = getSession();
  if (s) audit(s.id, "auth.logout", "user", s.id);
  clearSessionCookie();
  redirect("/login");
}
