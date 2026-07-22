/** cents → "$1,234.56" */
export function money(cents: number): string {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function moneyCompact(cents: number): string {
  const v = (cents ?? 0) / 100;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export function num(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}

/** "2026-07-20 14:03:22" → "Jul 20, 2:03 PM" */
export function shortDateTime(s: string): string {
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function shortDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s.length <= 10 ? s + "T00:00:00" : s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
