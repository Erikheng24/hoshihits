"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { QrScanner } from "@/components/QrScanner";
import { extractCert } from "@/lib/cert";

/** Scan a slab QR / barcode → filters the inventory list to that card. */
export function InventoryScanButton({ basePath }: { basePath: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function onResult(text: string) {
    setOpen(false);
    const q = extractCert(text) || text.trim();
    if (q) router.push(`${basePath}?q=${encodeURIComponent(q)}`);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost px-4 py-2 text-sm" title="Scan a slab QR / barcode to find the card">
        <Icon name="scan" className="w-4 h-4" /> Scan to find
      </button>
      {open && <QrScanner onResult={onResult} onClose={() => setOpen(false)} title="Scan slab QR to find it" />}
    </>
  );
}
