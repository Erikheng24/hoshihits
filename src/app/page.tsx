import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { needsSetup } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  if (needsSetup()) redirect("/setup");
  redirect(getSession() ? "/dashboard" : "/login");
}
