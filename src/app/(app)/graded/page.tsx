import { requireModule } from "@/lib/auth";
import { InventoryView, type InventorySearchParams } from "@/components/InventoryView";

export const dynamic = "force-dynamic";

export default function GradedPage({ searchParams }: { searchParams: InventorySearchParams }) {
  requireModule("graded");
  return (
    <InventoryView
      sp={searchParams}
      basePath="/graded"
      mode="graded"
      title="Graded Cards"
      subtitle="Slabbed inventory — grading company, grade, and cert number per slab."
    />
  );
}
