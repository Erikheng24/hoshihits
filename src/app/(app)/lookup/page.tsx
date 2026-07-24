import { requireModule } from "@/lib/auth";
import { getAiUsage } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { enrichScan, identifyPhotoAction } from "@/app/(app)/inventory/enrich";
import { LookupClient } from "./LookupClient";

export const dynamic = "force-dynamic";

export default function LookupPage() {
  requireModule("lookup");
  return (
    <>
      <PageHeader
        title="Card Lookup"
        subtitle="Photograph a card, slab or box to read its details — without adding it to stock."
      />
      <LookupClient enrich={enrichScan} identify={identifyPhotoAction} initialUsage={getAiUsage()} />
    </>
  );
}
