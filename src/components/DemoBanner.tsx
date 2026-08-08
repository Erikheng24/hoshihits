import { IS_DEMO } from "@/lib/demo";

/** Slim strip shown across the admin on the demo/sandbox deployment. */
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="bg-gold/15 border-b border-gold/30 text-gold-soft text-[12px] text-center py-1.5 px-4 flex items-center justify-center gap-2">
      <span aria-hidden>🧪</span>
      <span><b>DEMO MODE</b> — sample data you can freely edit. Resets automatically. Not a real shop.</span>
    </div>
  );
}
