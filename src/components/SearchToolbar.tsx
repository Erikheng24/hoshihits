"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { QrScanner } from "./QrScanner";
import { extractCert } from "@/lib/cert";

/** URL-backed search + select filters; server components re-render with filtered data. */
export function SearchToolbar({
  placeholder = "Search…",
  filters = [],
  scan = false,
}: {
  placeholder?: string;
  filters?: { name: string; label: string; options: { value: string; label: string }[] }[];
  scan?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [scanOpen, setScanOpen] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();

  function push(next: URLSearchParams) {
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q) next.set("q", q);
      else next.delete("q");
      if ((params.get("q") ?? "") !== q) push(next);
    }, 250);
    return () => clearTimeout(t.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <div className="relative flex-1 min-w-[200px]">
        <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
        <input className={`input pl-9 ${scan ? "pr-11" : ""}`} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
        {scan && (
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            title="Scan a slab QR / barcode with the camera"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-gold hover:bg-gold/10 grid place-items-center"
          >
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>
          </button>
        )}
      </div>
      {scanOpen && (
        <QrScanner
          title="Scan slab QR to find it"
          onClose={() => setScanOpen(false)}
          onResult={(text) => { setScanOpen(false); setQ(extractCert(text) || text.trim()); }}
        />
      )}
      {filters.map((f) => (
        <select
          key={f.name}
          className="input !w-auto"
          value={params.get(f.name) ?? ""}
          onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            if (e.target.value) next.set(f.name, e.target.value);
            else next.delete(f.name);
            push(next);
          }}
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}
    </div>
  );
}
