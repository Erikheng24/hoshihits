"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, audit } from "@/lib/db";
import { requireModule } from "@/lib/auth";

const KEYS = ["store_name", "store_tagline", "store_address", "store_phone", "receipt_footer"];

export async function saveSettingsAction(formData: FormData) {
  const user = requireModule("settings");
  const db = getDb();
  const up = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)");
  for (const key of KEYS) {
    const v = formData.get(key);
    if (v !== null) up.run(key, String(v).trim());
  }

  // Logo: a downscaled data URL, or empty to clear it. Capped so a stray upload
  // can't bloat the settings row.
  const logo = String(formData.get("logo") ?? "").trim();
  if (logo === "") up.run("logo", "");
  else if (logo.startsWith("data:image/") && logo.length < 400_000) up.run("logo", logo);
  audit(user.id, "settings.update", "settings", undefined, [...KEYS, "logo"].join(", "));
  revalidatePath("/", "layout"); // branding shows in the shell, so refresh everything
  redirect("/settings");
}
