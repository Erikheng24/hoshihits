"use server";

import { revalidatePath } from "next/cache";
import { getDb, audit } from "@/lib/db";
import { requireUser, setSessionCookie } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/hash";

export interface ProfileState {
  error?: string;
  ok?: string;
}

/** Update the signed-in user's own name / email / avatar. */
export async function saveProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const me = requireUser();
  const db = getDb();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rawAvatar = String(formData.get("avatar") ?? "");

  if (!name) return { error: "Enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };

  const clash = db.prepare("SELECT id FROM users WHERE lower(email)=? AND id != ?").get(email, me.id) as { id: number } | undefined;
  if (clash) return { error: "Another account already uses that email." };

  // "" leaves the picture as-is, "__clear__" removes it, otherwise it's a new data URL.
  const clearAvatar = rawAvatar === "__clear__";
  const avatar = rawAvatar.startsWith("data:image/") && rawAvatar.length < 400_000 ? rawAvatar : null;

  if (avatar || clearAvatar) {
    db.prepare("UPDATE users SET name=?, email=?, avatar=? WHERE id=?").run(name, email, clearAvatar ? null : avatar, me.id);
  } else {
    db.prepare("UPDATE users SET name=?, email=? WHERE id=?").run(name, email, me.id);
  }

  // Keep the session in step so the topbar and receipts show the new details.
  setSessionCookie({ id: me.id, name, email, role: me.role });
  audit(me.id, "profile.update", "user", me.id, email);
  revalidatePath("/", "layout");
  return { ok: "Profile saved." };
}

/** Change own password — requires the current one. */
export async function changePasswordAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const me = requireUser();
  const db = getDb();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "The two new passwords don't match." };

  const row = db.prepare("SELECT password_hash FROM users WHERE id=?").get(me.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(current, row.password_hash)) {
    audit(me.id, "profile.password_failed", "user", me.id);
    return { error: "Your current password is not correct." };
  }

  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(next), me.id);
  audit(me.id, "profile.password_changed", "user", me.id);
  return { ok: "Password changed." };
}
