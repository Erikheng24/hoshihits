"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { placeWebOrderAction, type PlaceOrderResult } from "./actions";

export interface ShopProduct {
  id: number;
  name: string;
  game: string;
  category: string;
  set_name: string | null;
  rarity: string | null;
  condition: string | null;
  grade_company: string | null;
  grade: string | null;
  price: number;
  stock: number;
  image: string | null;
}

const CATS = [
  { key: "", label: "All" },
  { key: "sealed", label: "Boxes & Packs" },
  { key: "single", label: "Singles" },
  { key: "graded", label: "Graded" },
  { key: "accessory", label: "Accessories" },
];

export function ShopClient({
  products,
  shopName,
  tagline,
  logo,
  welcome,
  telegramReady,
}: {
  products: ShopProduct[];
  shopName: string;
  tagline: string;
  logo: string | null;
  welcome: string;
  telegramReady: boolean;
}) {
  const [q, setQ] = useState("");
  const [game, setGame] = useState("");
  const [cat, setCat] = useState("");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<PlaceOrderResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const games = useMemo(() => Array.from(new Set(products.map((p) => p.game))), [products]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!game || p.game === game) &&
        (!cat || p.category === cat) &&
        (!needle || p.name.toLowerCase().includes(needle) || (p.set_name ?? "").toLowerCase().includes(needle))
    );
  }, [products, q, game, cat]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const cartLines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ product: byId.get(Number(id))!, qty }))
    .filter((l) => l.product);
  const total = cartLines.reduce((a, l) => a + l.product.price * l.qty, 0);
  const count = cartLines.reduce((a, l) => a + l.qty, 0);

  const setQty = (id: number, qty: number) => {
    const max = byId.get(id)?.stock ?? 0;
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(qty, max)) }));
  };
  const add = (id: number) => setQty(id, (cart[id] ?? 0) + 1);

  async function placeOrder() {
    setErr(null);
    if (!name.trim() || !phone.trim()) {
      setErr("Please enter your name and phone number.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await placeWebOrderAction({
        name,
        phone,
        note,
        items: cartLines.map((l) => ({ productId: l.product.id, qty: l.qty })),
      });
      if (!res.ok) {
        setErr(res.error ?? "Something went wrong. Please try again.");
        return;
      }
      // If the bot couldn't post it, copy the order so the customer can paste it.
      if (!res.telegramSent && res.orderText) {
        try {
          await navigator.clipboard.writeText(res.orderText);
        } catch {
          /* clipboard may be blocked — the success screen still shows the text */
        }
      }
      setDone(res);
      setCart({});
    } catch {
      setErr("Couldn't place the order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- success screen ----
  if (done) {
    return (
      <main className="min-h-screen bg-ink text-white flex items-center justify-center p-5">
        <div className="card p-7 max-w-sm w-full text-center animate-rise">
          <div className="w-16 h-16 rounded-full bg-jade/15 border-2 border-jade grid place-items-center mx-auto mb-5">
            <svg viewBox="0 0 24 24" className="w-9 h-9 text-jade" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="font-display text-xl tracking-wide">Order placed!</h1>
          <p className="text-fog text-sm mt-1 num">Order {done.number}</p>
          <p className="text-mist text-sm mt-4">
            {done.telegramSent
              ? "We've sent your order to the shop. Tap below to open our Telegram and arrange payment."
              : "Tap below to open our Telegram — your order is copied, just paste and send it to us."}
          </p>
          {done.telegramLink ? (
            <a href={done.telegramLink} target="_blank" rel="noopener" className="btn-gold w-full py-3 mt-5 justify-center">
              Open Telegram to pay
            </a>
          ) : (
            <p className="text-fog text-[12px] mt-5">The shop will contact you on the phone number you provided.</p>
          )}
          <button onClick={() => setDone(null)} className="btn-ghost w-full py-2.5 mt-2 justify-center text-sm">
            Back to shop
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-white pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 glass border-b border-edge">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="w-9 h-9 rounded-lg object-cover" />
          ) : (
            <span className="w-9 h-9 rounded-lg bg-gold/15 border border-gold/40 grid place-items-center text-gold">★</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display tracking-[0.12em] text-gold-grad leading-tight truncate">{shopName.toUpperCase()}</p>
            {tagline && <p className="text-[11px] text-fog truncate">{tagline}</p>}
          </div>
          <button onClick={() => setCartOpen(true)} className="relative btn-ghost px-3 py-2 text-sm">
            Cart
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-gold text-ink text-[11px] font-bold grid place-items-center">{count}</span>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4">
        {welcome && <p className="text-mist text-sm mt-4 text-center">{welcome}</p>}

        {/* Filters */}
        <div className="mt-4 flex flex-col gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input"
            placeholder="Search cards, boxes, sets…"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            <select value={game} onChange={(e) => setGame(e.target.value)} className="input w-auto shrink-0">
              <option value="">All games</option>
              {games.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`px-3 py-2 rounded-full text-[12px] whitespace-nowrap border transition-colors shrink-0 ${
                  cat === c.key ? "bg-gold/12 border-gold/35 text-gold-soft" : "border-edge text-fog hover:text-mist"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        {filtered.length === 0 ? (
          <p className="text-center text-fog py-20">No products match — try another search.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
            {filtered.map((p) => {
              const qty = cart[p.id] ?? 0;
              return (
                <div key={p.id} className="card overflow-hidden flex flex-col">
                  <div className="aspect-square bg-panel-2 grid place-items-center overflow-hidden">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-fog text-4xl">★</span>
                    )}
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <p className="text-[13px] text-white leading-snug line-clamp-2">{p.name}</p>
                    <p className="text-[11px] text-fog mt-0.5 truncate">
                      {[p.set_name, p.grade_company && p.grade ? `${p.grade_company} ${p.grade}` : p.condition, p.rarity].filter(Boolean).join(" · ") || p.game}
                    </p>
                    <p className="num text-gold-soft font-semibold mt-1.5">{money(p.price)}</p>
                    <p className="text-[10px] text-fog num">{p.stock} in stock</p>
                    <div className="mt-2">
                      {qty === 0 ? (
                        <button onClick={() => add(p.id)} className="btn-gold w-full py-1.5 text-[12px]">Add</button>
                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <button onClick={() => setQty(p.id, qty - 1)} className="btn-ghost w-8 h-8 !rounded-lg">−</button>
                          <span className="num text-sm">{qty}</span>
                          <button onClick={() => setQty(p.id, qty + 1)} disabled={qty >= p.stock} className="btn-ghost w-8 h-8 !rounded-lg disabled:opacity-40">+</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky cart bar */}
      {count > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 btn-gold px-6 py-3 shadow-pop flex items-center gap-3 animate-rise"
        >
          <span className="min-w-5 h-5 px-1 rounded-full bg-ink/20 text-[12px] font-bold grid place-items-center">{count}</span>
          View cart · {money(total)}
        </button>
      )}

      {/* Cart / checkout drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/75 animate-fadein" onClick={() => !submitting && setCartOpen(false)} />
          <div className="relative card shadow-pop w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 animate-rise rounded-b-none sm:rounded-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg tracking-wide">Your order</h2>
              <button onClick={() => setCartOpen(false)} className="text-fog hover:text-white text-xl leading-none">×</button>
            </div>

            {cartLines.length === 0 ? (
              <p className="text-fog text-sm py-8 text-center">Your cart is empty.</p>
            ) : (
              <>
                <div className="space-y-2.5 mb-4">
                  {cartLines.map((l) => (
                    <div key={l.product.id} className="flex items-center gap-3">
                      {l.product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.product.image} alt="" className="w-11 h-11 rounded object-cover shrink-0" />
                      ) : (
                        <span className="w-11 h-11 rounded bg-panel-2 grid place-items-center text-fog shrink-0">★</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-white truncate">{l.product.name}</p>
                        <p className="num text-[12px] text-gold-soft">{money(l.product.price)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setQty(l.product.id, l.qty - 1)} className="btn-ghost w-7 h-7 !rounded-md">−</button>
                        <span className="num text-sm w-5 text-center">{l.qty}</span>
                        <button onClick={() => setQty(l.product.id, l.qty + 1)} disabled={l.qty >= l.product.stock} className="btn-ghost w-7 h-7 !rounded-md disabled:opacity-40">+</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center border-t border-dashed border-edge pt-3 mb-4">
                  <span className="text-mist">Total</span>
                  <span className="num text-xl font-semibold text-gold-soft">{money(total)}</span>
                </div>

                <div className="space-y-3">
                  <label className="field"><span>Your name *</span><input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Name" /></label>
                  <label className="field"><span>Phone / Telegram *</span><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input num" placeholder="e.g. 012 345 678" /></label>
                  <label className="field"><span>Note (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Anything we should know?" /></label>
                </div>

                {err && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 mt-3">{err}</p>}

                <button onClick={placeOrder} disabled={submitting} className="btn-gold w-full py-3 mt-4 justify-center disabled:opacity-60">
                  {submitting ? "Sending…" : `Order now · ${money(total)}`}
                </button>
                <p className="text-[11px] text-fog text-center mt-2">
                  {telegramReady ? "We'll receive your order on Telegram and message you to arrange payment." : "We'll get your order and contact you to arrange payment."}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
