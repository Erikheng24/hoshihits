"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { UnifiedScanner } from "./UnifiedScanner";
import type { ItemKind, EnrichResult } from "@/lib/scan";
import type { QuickAddInput } from "@/app/(app)/inventory/enrich";

export function ScanToAddButton({
  enrich,
  quickAdd,
  games,
}: {
  enrich: (kind: ItemKind, code: string, game?: string) => Promise<EnrichResult>;
  quickAdd: (input: QuickAddInput) => Promise<{ ok: boolean; error?: string; id?: number; sku?: string }>;
  games: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-gold px-4 py-2 text-sm">
        <Icon name="scan" className="w-4 h-4" /> Scan to add
      </button>
      {open && (
        <UnifiedScanner enrich={enrich} quickAdd={quickAdd} games={games} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
