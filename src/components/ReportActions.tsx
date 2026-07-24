"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

/**
 * Print / Excel / CSV menu for a report section.
 *
 * The panel is rendered into a portal with fixed positioning so it can never be
 * clipped or dimmed by the page header it sits in, and it flips above the
 * button when there isn't room below.
 */

const MENU_W = 252;
const GAP = 8;

export function ReportActions({ section, label = "Export" }: { section: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const h = menu?.offsetHeight ?? 172;
    const below = r.bottom + GAP;
    const flip = below + h > window.innerHeight - GAP && r.top - GAP - h > GAP;
    const left = Math.min(Math.max(GAP, r.right - MENU_W), window.innerWidth - MENU_W - GAP);
    setPos({ top: flip ? r.top - GAP - h : below, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onMove = () => place();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place]);

  const close = () => setOpen(false);

  const items = [
    {
      href: `/print/${section}`,
      target: "_blank",
      icon: "receipt",
      tint: "text-gold-soft",
      title: "Print report",
      sub: "Formatted page, new tab",
    },
    {
      href: `/api/report?section=${section}&format=xlsx`,
      icon: "reports",
      tint: "text-jade",
      title: "Excel (.xlsx)",
      sub: "Styled workbook, ready to print",
    },
    {
      href: `/api/report?section=${section}&format=csv`,
      icon: "export",
      tint: "text-mist",
      title: "CSV",
      sub: "Plain data for spreadsheets",
    },
  ];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`btn-ghost px-4 py-2 text-sm no-print ${open ? "!border-gold/45 !text-white" : ""}`}
      >
        <Icon name="export" className="w-4 h-4" />
        {label}
        <Icon name="chevronDown" className={`w-3.5 h-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[90] no-print" onClick={close} aria-hidden="true" />
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                width: MENU_W,
                // Hidden (but still measurable) until it has been placed, so it
                // never flashes in the wrong spot. No fade — the panel must be
                // fully opaque the moment it is visible.
                visibility: pos ? "visible" : "hidden",
                backgroundColor: "#181818",
                zIndex: 91,
              }}
              className="no-print rounded-xl border border-edge-2 p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)]"
            >
              {items.map((it) => (
                <a
                  key={it.title}
                  href={it.href}
                  target={it.target}
                  rel={it.target ? "noopener" : undefined}
                  onClick={close}
                  role="menuitem"
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gold/[0.09] focus:bg-gold/[0.09] focus:outline-none transition-colors"
                >
                  <Icon name={it.icon} className={`w-4 h-4 mt-[3px] shrink-0 ${it.tint}`} />
                  <span className="min-w-0">
                    <span className="block text-sm leading-5 text-white">{it.title}</span>
                    <span className="block text-[11px] leading-4 text-fog">{it.sub}</span>
                  </span>
                </a>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
