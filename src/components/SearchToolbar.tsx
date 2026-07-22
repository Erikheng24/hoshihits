"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/** URL-backed search + select filters; server components re-render with filtered data. */
export function SearchToolbar({
  placeholder = "Search…",
  filters = [],
}: {
  placeholder?: string;
  filters?: { name: string; label: string; options: { value: string; label: string }[] }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
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
        <input className="input pl-9" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
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
