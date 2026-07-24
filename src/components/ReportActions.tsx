"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";

/**
 * Print / Excel / CSV menu for a report section.
 * Rendered in the page header next to the other actions.
 */
export function ReportActions({ section, label = "Export" }: { section: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex items-center gap-2.5 w-full px-3 py-2 text-sm text-mist hover:bg-gold/[0.08] hover:text-white transition-colors";

  return (
    <div className="relative no-print" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost px-4 py-2 text-sm" aria-haspopup="menu" aria-expanded={open}>
        <Icon name="export" className="w-4 h-4" /> {label}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 card p-1.5 shadow-pop z-40 animate-rise" role="menu">
          <Link href={`/print/${section}`} target="_blank" className={item} onClick={() => setOpen(false)}>
            <Icon name="receipt" className="w-4 h-4 text-gold-dim shrink-0" />
            <span className="flex-1 text-left">
              Print report
              <span className="block text-[11px] text-fog">Formatted page</span>
            </span>
          </Link>
          <a href={`/api/report?section=${section}&format=xlsx`} className={item} onClick={() => setOpen(false)}>
            <Icon name="reports" className="w-4 h-4 text-jade shrink-0" />
            <span className="flex-1 text-left">
              Excel (.xlsx)
              <span className="block text-[11px] text-fog">Styled, ready to print</span>
            </span>
          </a>
          <a href={`/api/report?section=${section}&format=csv`} className={item} onClick={() => setOpen(false)}>
            <Icon name="export" className="w-4 h-4 text-fog shrink-0" />
            <span className="flex-1 text-left">
              CSV
              <span className="block text-[11px] text-fog">Plain data</span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
