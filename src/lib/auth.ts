import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";

const SECRET = process.env.HOSHI_SECRET ?? "hoshihits-dev-secret-change-in-production";
const COOKIE = "hoshi_session";

export type Role = "OWNER" | "MANAGER" | "CASHIER" | "INVENTORY" | "ACCOUNTANT";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 12 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return { id: data.id, name: data.name, email: data.email, role: data.role };
  } catch {
    return null;
  }
}

export function getSession(): SessionUser | null {
  return parseSessionToken(cookies().get(COOKIE)?.value);
}

export function setSessionCookie(user: SessionUser) {
  cookies().set(COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

/** Per-module access map. OWNER always allowed. */
export const ACCESS: Record<string, Role[]> = {
  dashboard: ["OWNER", "MANAGER", "CASHIER", "INVENTORY", "ACCOUNTANT"],
  pos: ["OWNER", "MANAGER", "CASHIER"],
  inventory: ["OWNER", "MANAGER", "INVENTORY"],
  singles: ["OWNER", "MANAGER", "INVENTORY"],
  graded: ["OWNER", "MANAGER", "INVENTORY"],
  preorders: ["OWNER", "MANAGER", "CASHIER"],
  shipments: ["OWNER", "MANAGER", "INVENTORY"],
  customers: ["OWNER", "MANAGER", "CASHIER"],
  tradein: ["OWNER", "MANAGER", "CASHIER"],
  tournaments: ["OWNER", "MANAGER", "CASHIER"],
  suppliers: ["OWNER", "MANAGER", "INVENTORY"],
  "purchase-orders": ["OWNER", "MANAGER", "INVENTORY"],
  accounting: ["OWNER", "ACCOUNTANT"],
  reports: ["OWNER", "MANAGER", "ACCOUNTANT"],
  employees: ["OWNER"],
  settings: ["OWNER"],
};

export function canAccess(role: Role, moduleKey: string): boolean {
  if (role === "OWNER") return true;
  const allowed = ACCESS[moduleKey];
  return allowed ? allowed.includes(role) : false;
}

/** For server pages: returns the user or redirects. */
export function requireUser(): SessionUser {
  const user = getSession();
  if (!user) redirect("/login");
  // ensure the account still exists + is active
  const row = getDb().prepare("SELECT active FROM users WHERE id = ?").get(user.id) as { active: number } | undefined;
  if (!row || !row.active) redirect("/login");
  return user;
}

export function requireModule(moduleKey: string): SessionUser {
  const user = requireUser();
  if (!canAccess(user.role, moduleKey)) redirect("/dashboard?denied=" + moduleKey);
  return user;
}
