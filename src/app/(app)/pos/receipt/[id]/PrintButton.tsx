"use client";

import { Icon } from "@/components/icons";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-gold px-4 py-2 text-sm">
      <Icon name="receipt" className="w-4 h-4" /> Print
    </button>
  );
}
