"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { UnifiedScanner } from "./UnifiedScanner";
import type { AiUsageLike } from "./AiBattery";
import type { ItemKind, EnrichResult } from "@/lib/scan";
import type { QuickAddInput, PhotoIdResult } from "@/app/(app)/inventory/enrich";

export function ScanToAddButton({
  enrich,
  quickAdd,
  identify,
  games,
  initialUsage,
}: {
  enrich: (kind: ItemKind, code: string, game?: string) => Promise<EnrichResult>;
  quickAdd: (input: QuickAddInput) => Promise<{ ok: boolean; error?: string; id?: number; sku?: string }>;
  identify: (dataUrl: string, gameHint?: string) => Promise<PhotoIdResult>;
  games: string[];
  initialUsage?: AiUsageLike;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-gold px-4 py-2 text-sm">
        <Icon name="scan" className="w-4 h-4" /> Scan to add
      </button>
      {open && (
        <UnifiedScanner enrich={enrich} quickAdd={quickAdd} identify={identify} games={games} initialUsage={initialUsage} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
