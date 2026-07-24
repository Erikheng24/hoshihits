"use client";

import { Icon } from "./icons";

/** Opens the browser print dialog for the report sheet. */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-[#1a1a1a] text-white px-4 py-2 text-sm hover:bg-black transition-colors"
    >
      <Icon name="pos" className="w-4 h-4" /> Print
    </button>
  );
}
