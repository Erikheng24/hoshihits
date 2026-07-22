"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { money } from "@/lib/format";
import { createTradeinAction, type TradeLine } from "./actions";

const GAMES = ["Pokémon", "One Piece", "Yu-Gi-Oh!", "Weiss Schwarz", "Union Arena", "Magic", "Digimon", "Dragon Ball", "Gundam"];
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

interface Row extends Omit<TradeLine, "unitValueCents"> { unitValue: string }
const empty = (): Row => ({ name: "", game: "Pokémon", condition: "NM", qty: 1, unitValue: "" });

export function TradeinClient({ customers }: { customers: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([empty()]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [kind, setKind] = useState<"buylist" | "tradein">("buylist");
  const [addToStock, setAddToStock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; total: number } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const total = rows.reduce((a, r) => a + (Math.round((parseFloat(r.unitValue) || 0) * 100)) * (r.qty || 0), 0);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await createTradeinAction({
        customerId,
        kind,
        addToStock,
        lines: rows
          .filter((r) => r.name.trim())
          .map((r) => ({
            name: r.name, game: r.game, condition: r.condition,
            qty: Number(r.qty) || 1,
            unitValueCents: Math.round((parseFloat(r.unitValue) || 0) * 100),
          })),
      });
      if (!res.ok) {
        setError(res.error ?? "Failed.");
        return;
      }
      setDone({ number: res.number!, total: res.total! });
      setRows([empty()]);
      setCustomerId(null);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setDone(null); }} className="btn-gold px-4 py-2 text-sm">
        <Icon name="plus" className="w-4 h-4" /> New intake
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 animate-fadein" onClick={() => !pending && setOpen(false)} />
          <div className="relative card shadow-pop w-full max-w-3xl p-6 animate-rise max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">{done ? "Intake Complete" : "Buylist / Trade-In Intake"}</h2>
              <button onClick={() => setOpen(false)} className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></button>
            </div>

            {done ? (
              <div className="text-center py-8">
                <span className="inline-flex w-14 h-14 rounded-full bg-jade/10 border border-jade/30 text-jade items-center justify-center mb-4">
                  <Icon name="check" className="w-6 h-6" />
                </span>
                <p className="text-white text-lg num">{done.number}</p>
                <p className="text-fog mt-1">Payout total: <span className="num text-gold-soft">{money(done.total)}</span></p>
                <button onClick={() => setDone(null)} className="btn-gold px-5 py-2.5 text-sm mt-6">New intake</button>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  <label className="field"><span>Type</span>
                    <select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                      <option value="buylist">Buylist (we buy)</option>
                      <option value="tradein">Trade-in</option>
                    </select>
                  </label>
                  <label className="field"><span>Customer</span>
                    <select className="input" value={customerId ?? ""} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Walk-in</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="hidden sm:grid grid-cols-[1fr_120px_80px_60px_90px_32px] gap-2 text-[10px] uppercase tracking-[0.14em] text-fog px-1">
                    <span>Card</span><span>Game</span><span>Cond.</span><span>Qty</span><span>Value ($)</span><span />
                  </div>
                  {rows.map((r, i) => (
                    <div key={i} className="grid sm:grid-cols-[1fr_120px_80px_60px_90px_32px] grid-cols-2 gap-2">
                      <input className="input col-span-2 sm:col-span-1" placeholder="Card name" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
                      <select className="input" value={r.game} onChange={(e) => update(i, { game: e.target.value })}>
                        {GAMES.map((g) => <option key={g}>{g}</option>)}
                      </select>
                      <select className="input" value={r.condition} onChange={(e) => update(i, { condition: e.target.value })}>
                        {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <input className="input num" type="number" min={1} value={r.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} />
                      <input className="input num" type="number" step="0.01" min={0} placeholder="0.00" value={r.unitValue} onChange={(e) => update(i, { unitValue: e.target.value })} />
                      <button
                        onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
                        className="text-fog hover:text-ruby flex items-center justify-center" title="Remove"
                      >
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setRows((p) => [...p, empty()])} className="btn-ghost px-3 py-1.5 text-[12px]">
                    <Icon name="plus" className="w-3.5 h-3.5" /> Add row
                  </button>
                </div>

                <label className="flex items-center gap-2 text-sm text-mist mb-4">
                  <input type="checkbox" checked={addToStock} onChange={(e) => setAddToStock(e.target.checked)} className="accent-[#D4AF37]" />
                  Add cards to inventory as singles (auto-priced at +40%)
                </label>

                {error && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 mb-3">{error}</p>}

                <div className="flex items-center justify-between border-t border-edge pt-4">
                  <p className="text-sm text-fog">Payout total: <span className="num text-gold-soft text-lg font-semibold">{money(total)}</span></p>
                  <button onClick={submit} disabled={pending || total <= 0} className="btn-gold px-6 py-2.5 text-sm disabled:opacity-50">
                    {pending ? "Saving…" : `Complete ${kind === "buylist" ? "buylist" : "trade-in"}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
