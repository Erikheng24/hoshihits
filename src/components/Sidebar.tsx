"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";
import { BrandMark } from "./BrandMark";
import type { NavItem } from "@/lib/nav";
import type { Branding } from "@/lib/branding";

const SECTIONS: NavItem["section"][] = ["Store", "Catalog", "Operations", "Back Office"];

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-6 space-y-5">
      {SECTIONS.map((section) => {
        const group = items.filter((i) => i.section === section);
        if (group.length === 0) return null;
        return (
          <div key={section}>
            <p className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.22em] text-fog">{section}</p>
            <ul className="space-y-0.5">
              {group.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
                        active
                          ? "bg-gold/10 text-gold-soft border border-gold/25"
                          : "text-mist hover:text-white hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <Icon name={item.icon} className={`w-[18px] h-[18px] ${active ? "text-gold" : "text-fog group-hover:text-mist"}`} />
                      {item.label}
                      {active && <span className="ml-auto w-1 h-1 rounded-full bg-gold" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ brand }: { brand: Branding }) {
  return (
    <div className="px-6 pt-6 pb-5">
      <Link href="/dashboard">
        <BrandMark brand={brand} size={32} />
      </Link>
    </div>
  );
}

export function Sidebar({ items, brand }: { items: NavItem[]; brand: Branding }) {
  return (
    <aside className="hidden lg:flex flex-col w-[248px] shrink-0 border-r border-edge bg-[#0d0d0d]/80 sticky top-0 h-screen">
      <Brand brand={brand} />
      <div className="gold-rule mx-6 mb-4" />
      <NavLinks items={items} />
    </aside>
  );
}

/** Mobile bottom quick tabs — must live OUTSIDE the glass header (backdrop-filter creates a containing block for fixed elements). */
export function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const quick = items.filter((i) => ["dashboard", "pos", "inventory", "customers"].includes(i.key)).slice(0, 4);
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-edge no-print">
      <ul className="grid grid-cols-4">
        {quick.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.key}>
              <Link href={item.href} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] tracking-wide ${active ? "text-gold" : "text-fog"}`}>
                <Icon name={item.icon} className="w-5 h-5" />
                {item.label.split(" ")[0]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile: hamburger + slide-in drawer (rendered inside the topbar) */
export function MobileNav({ items, brand }: { items: NavItem[]; brand: Branding }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-edge bg-panel-2 text-mist"
        aria-label="Open menu"
      >
        <Icon name="menu" className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 animate-fadein" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] bg-[#0d0d0d] border-r border-edge flex flex-col animate-rise">
            <div className="flex items-center justify-between pr-4">
              <Brand brand={brand} />
              <button onClick={() => setOpen(false)} className="text-fog hover:text-white" aria-label="Close menu">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="gold-rule mx-6 mb-4" />
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
