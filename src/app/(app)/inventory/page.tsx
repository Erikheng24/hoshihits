import { requireModule } from "@/lib/auth";
import { InventoryView, type InventorySearchParams } from "@/components/InventoryView";

export const dynamic = "force-dynamic";

export default function InventoryPage({ searchParams }: { searchParams: InventorySearchParams }) {
  requireModule("inventory");
  return (
    <InventoryView
      sp={searchParams}
      basePath="/inventory"
      mode="all"
      title="Inventory"
      subtitle="Every product across sealed, singles, graded, and accessories."
    />
  );
}
