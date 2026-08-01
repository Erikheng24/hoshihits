"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { money } from "@/lib/format";
import { fileToDataUrl } from "@/lib/image-client";
import { createPreorderAction } from "./actions";

interface Line { product_name: string; game: string; qty: string; unit_price: string; image: string }

const blank = (game: string): Line => ({ product_name: "", game, qty: "1", unit_price: "", image: "" });

export function PreorderForm({ customers, games }: { customers: { id: number; name: string }[]; games: string[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [expected, setExpected] = useState("");
  const [deposit, setDeposit] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(games[0] ?? "Pokémon")]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, blank(games[0] ?? "Pokémon")]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));

  async function pickPhoto(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setLine(i, { image: await fileToDataUrl(file, 800, 0.82) }); } catch { /* ignore */ }
    finally { e.target.value = ""; }
  }

  const total = lines.reduce((a, l) => a + (parseFloat(l.unit_price) || 0) * (parseInt(l.qty) || 0), 0);
  const depositNum = parseFloat(deposit) || 0;

  async function submit() {
    setErr(null);
    if (!customerId) { setErr("Please choose a customer."); return; }
    const items = lines
      .filter((l) => l.product_name.trim() && (parseFloat(l.unit_price) || 0) > 0)
      .map((l) => ({
        product_name: l.product_name.trim(),
        game: l.game,
        qty: parseInt(l.qty) || 1,
        unitPriceCents: Math.round((parseFloat(l.unit_price) || 0) * 100),
        image: l.image || undefined,
      }));
    if (!items.length) { setErr("Add at least one item with a name and price."); return; }
    setBusy(true);
    try {
      const res = await createPreorderAction({
        customerId: Number(customerId),
        expectedDate: expected || undefined,
        depositCents: Math.round(depositNum * 100),
        items,
      });
      if (!res.ok) { setErr(res.error ?? "Couldn't create the preorder."); return; }
      router.push("/preorders");
      router.refresh();
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="field sm:col-span-2"><span>Customer *</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input">
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Expected date</span>
          <input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className="input num" />
        </label>
        <label className="field"><span>Deposit ($)</span>
          <input type="number" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input num" placeholder="0.00" />
        </label>
      </div>

      {/* Line items */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-mist mb-1">Items</p>
        <div className="gold-rule mb-3" />
        <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
          {lines.map((l, i) => (
            <div key={i} className="rounded-lg border border-edge bg-panel-2 p-3">
              <div className="flex items-start gap-2">
                <label className="w-14 h-14 rounded-lg border border-edge bg-panel overflow-hidden grid place-items-center cursor-pointer shrink-0 hover:border-gold/40">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image} alt="" className="w-full h-full object-cover" />
                  ) : <Icon name="scan" className="w-5 h-5 text-fog" />}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(i, e)} />
                </label>
                <div className="flex-1 min-w-0 space-y-2">
                  <input value={l.product_name} onChange={(e) => setLine(i, { product_name: e.target.value })} className="input" placeholder="Product name (e.g. OP-10 Booster Box)" />
                  <div className="grid grid-cols-3 gap-2">
                    <select value={l.game} onChange={(e) => setLine(i, { game: e.target.value })} className="input text-[12px]">
                      {games.map((g) => <option key={g}>{g}</option>)}
                    </select>
                    <input type="number" min="1" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="input num" placeholder="Qty" />
                    <input type="number" step="0.01" min="0" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} className="input num" placeholder="Price $" />
                  </div>
                </div>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="btn-ghost w-7 h-7 !rounded-md text-ruby/70 hover:text-ruby shrink-0" title="Remove item">
                    <Icon name="trash" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine} className="btn-ghost w-full py-2 text-sm mt-3">
          <Icon name="plus" className="w-4 h-4" /> Add another item
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-dashed border-edge pt-3 text-sm">
        <span className="text-mist">Total ({lines.length} line{lines.length === 1 ? "" : "s"})</span>
        <span className="num text-xl font-semibold text-gold-soft">{money(Math.round(total * 100))}</span>
      </div>
      {depositNum > 0 && (
        <div className="flex items-center justify-between text-[13px] -mt-2">
          <span className="text-fog">Balance due after deposit</span>
          <span className="num text-gold-soft">{money(Math.round((total - depositNum) * 100))}</span>
        </div>
      )}

      {err && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2">{err}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Link href="/preorders" className="btn-ghost px-4 py-2 text-sm">Cancel</Link>
        <button onClick={submit} disabled={busy} className="btn-gold px-5 py-2 text-sm disabled:opacity-60">
          {busy ? "Creating…" : "Create preorder"}
        </button>
      </div>
    </div>
  );
}
