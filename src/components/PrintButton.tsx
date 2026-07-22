"use client";

import { Icon } from "./icons";

/**
 * Opens the browser print dialog. That same dialog is also how you save a PDF
 * ("Destination → Save as PDF" on desktop, "Options → PDF" on phones), so one
 * button covers both printing and downloading.
 */
export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="btn-gold px-4 py-2 text-sm" title="Print, or choose “Save as PDF” in the dialog">
      <Icon name="receipt" className="w-4 h-4" /> {label}
    </button>
  );
}
