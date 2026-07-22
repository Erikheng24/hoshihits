import { requireModule } from "@/lib/auth";
import { InventoryView, type InventorySearchParams } from "@/components/InventoryView";

export const dynamic = "force-dynamic";

export default function SinglesPage({ searchParams }: { searchParams: InventorySearchParams }) {
  requireModule("singles");
  return (
    <InventoryView
      sp={searchParams}
      basePath="/singles"
      mode="single"
      title="Singles"
      subtitle="Raw single cards — set, rarity, and condition tracked per card."
    />
  );
}
