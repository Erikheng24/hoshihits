import { requireModule } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { enrichScan } from "@/app/(app)/inventory/enrich";
import { LookupClient } from "./LookupClient";

export const dynamic = "force-dynamic";

export default function LookupPage() {
  requireModule("lookup");
  return (
    <>
      <PageHeader
        title="Card Lookup"
        subtitle="Photograph a card or box to find its name, set and market price — without adding it to stock."
      />
      <LookupClient enrich={enrichScan} />
    </>
  );
}
