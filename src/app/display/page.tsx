import { requireModule } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { khqrConfigured } from "@/lib/khqr";
import { DisplayScreen } from "./DisplayScreen";

export const dynamic = "force-dynamic";

/**
 * Customer-facing payment display — meant to run full-screen on a spare phone
 * (e.g. an old iPhone in Safari) turned toward the customer. It shows the live
 * KHQR for the current sale and flips to a thank-you the instant Bakong
 * confirms payment. Log in once on that device and leave this page open.
 */
export default function DisplayPage() {
  requireModule("pos");
  const brand = getBranding();
  return <DisplayScreen name={brand.name} logo={brand.logo} configured={khqrConfigured()} />;
}
