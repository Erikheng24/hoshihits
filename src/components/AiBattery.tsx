"use client";

/**
 * AI quota shown like a phone battery — how much scanning is left today.
 *
 * One battery per configured AI provider (Gemini, Groq…). The bar fills with the
 * *remaining* percentage and turns amber, then red, as it drains, so the
 * shopkeeper can see at a glance before starting work whether they'll hit a
 * provider's daily limit.
 */

export interface BatteryProvider {
  id: string;
  label: string;
  used: number;
  limit: number;
  configured?: boolean;
}
export interface AiUsageLike {
  providers?: BatteryProvider[];
  used: number;
  limit: number;
}

function tone(pctLeft: number) {
  if (pctLeft <= 10) return { bar: "bg-ruby", text: "text-ruby" };
  if (pctLeft <= 30) return { bar: "bg-amberish", text: "text-amberish" };
  return { bar: "bg-jade", text: "text-jade" };
}

function Cell({ p }: { p: BatteryProvider }) {
  const left = Math.max(0, p.limit - p.used);
  const pctLeft = p.limit > 0 ? Math.round((left / p.limit) * 100) : 0;
  const empty = left <= 0;
  const c = tone(pctLeft);

  return (
    <div className="flex items-center gap-2" title={`${p.label}: ${p.used} of ${p.limit} scans used today`}>
      <span className="text-[11px] text-fog w-12 shrink-0">{p.label}</span>
      {/* battery: body + terminal nub */}
      <span className="relative inline-flex items-center">
        <span className="relative w-9 h-[15px] rounded-[3px] border border-edge-2 bg-panel-2 overflow-hidden">
          <span className={`absolute inset-y-[1.5px] left-[1.5px] rounded-[1.5px] ${c.bar} transition-all`} style={{ width: `calc(${pctLeft}% - 3px)` }} />
        </span>
        <span className="w-[2px] h-[7px] rounded-r-sm bg-edge-2 ml-[1px]" />
      </span>
      <span className={`num text-[11px] tabular-nums ${empty ? "text-ruby" : c.text}`}>{pctLeft}%</span>
      <span className="text-[11px] text-fog">
        {empty ? "— resets tomorrow" : `${left} left`}
      </span>
    </div>
  );
}

export function AiBattery({ usage, className = "" }: { usage: AiUsageLike; className?: string }) {
  const providers: BatteryProvider[] =
    usage.providers && usage.providers.length > 0
      ? usage.providers
      : [{ id: "ai", label: "AI", used: usage.used, limit: usage.limit }];

  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 ${className}`}>
      {providers.map((p) => (
        <Cell key={p.id} p={p} />
      ))}
    </div>
  );
}
