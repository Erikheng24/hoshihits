"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { money } from "@/lib/format";
import { checkoutAction, startKhqrPaymentAction, pollKhqrPaymentAction, cancelKhqrPaymentAction, type CheckoutResult } from "./actions";

interface Product {
  id: number; sku: string; barcode: string | null; name: string; game: string;
  category: string; set_name: string | null; price: number; stock: number;
  grade_company: string | null; grade: string | null; condition: string | null;
  image: string | null;
}
interface Customer { id: number; name: string; phone: string | null }
interface Line { product: Product; qty: number }

const CATS = [
  { key: "", label: "All" },
  { key: "sealed", label: "Sealed" },
  { key: "single", label: "Singles" },
  { key: "graded", label: "Graded" },
  { key: "accessory", label: "Accessories" },
];

export function PosClient({ products, customers, games }: { products: Product[]; customers: Customer[]; games: string[] }) {
  const [q, setQ] = useState("");
  const [game, setGame] = useState("");
  const [cat, setCat] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [discount, setDiscount] = useState(0); // cents
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "card" | "qr">("cash");
  const [tendered, setTendered] = useState(""); // dollars string
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  const [pending, startTransition] = useTransition();
  // Active KHQR payment: the QR is shown to the customer while we wait for Bakong.
  const [khqr, setKhqr] = useState<{ paymentId: number; image: string; amount: number; ref: string } | null>(null);
  const [khqrError, setKhqrError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!game || p.game === game) &&
        (!cat || p.category === cat) &&
        (!needle ||
          p.name.toLowerCase().includes(needle) ||
          p.sku.toLowerCase().includes(needle) ||
          (p.barcode ?? "").includes(needle))
    );
  }, [products, q, game, cat]);

  const inCart = (id: number) => lines.find((l) => l.product.id === id);
  const subtotal = lines.reduce((a, l) => a + l.product.price * l.qty, 0);
  const total = Math.max(0, subtotal - discount);
  const itemCount = lines.reduce((a, l) => a + l.qty, 0);
  const tenderedCents = Math.round((parseFloat(tendered) || 0) * 100);
  const changeDue = method === "cash" ? Math.max(0, tenderedCents - total) : 0;

  function add(p: Product) {
    setError(null);
    setLines((prev) => {
      const ex = prev.find((l) => l.product.id === p.id);
      if (ex) {
        if (ex.qty >= p.stock) return prev;
        return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      if (p.stock < 1) return prev;
      return [...prev, { product: p, qty: 1 }];
    });
  }

  function setQty(id: number, qty: number) {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== id)
        : prev.map((l) => (l.product.id === id ? { ...l, qty: Math.min(qty, l.product.stock) } : l))
    );
  }

  /** USB barcode scanners send the code + Enter — exact match adds instantly. */
  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    const needle = q.trim().toLowerCase();
    if (!needle) return;
    const exact = products.find((p) => p.barcode === needle || p.sku.toLowerCase() === needle);
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (target) {
      add(target);
      setQ("");
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await checkoutAction({
        lines: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        customerId,
        discountCents: discount,
        method,
        amountPaidCents: method === "cash" ? tenderedCents : total,
      });
      if (!res.ok) {
        setError(res.error ?? "Checkout failed.");
        return;
      }
      setResult(res);
      setPayOpen(false);
      setLines([]);
      setDiscount(0);
      setTendered("");
      setCustomerId(null);
      setMethod("cash");
    });
  }

  // ---- KHQR: show the QR, wait for Bakong to confirm, then auto-open the receipt ----
  function startQr() {
    setError(null);
    setKhqrError(null);
    startTransition(async () => {
      const res = await startKhqrPaymentAction({
        lines: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        customerId,
        discountCents: discount,
        method: "qr",
        amountPaidCents: total,
      });
      if (!res.ok || !res.paymentId || !res.image) {
        setError(res.error ?? "Couldn't start the QR payment.");
        return;
      }
      setKhqr({ paymentId: res.paymentId, image: res.image, amount: res.amount ?? total, ref: res.ref ?? "" });
    });
  }

  async function cancelQr() {
    if (khqr) await cancelKhqrPaymentAction(khqr.paymentId);
    setKhqr(null);
    setKhqrError(null);
  }

  // Poll the active KHQR payment ~every 2s until it's paid, cancelled or expires.
  useEffect(() => {
    if (!khqr) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const r = await pollKhqrPaymentAction(khqr.paymentId).catch(() => null);
      if (!alive) return;
      if (r?.status === "paid" && r.saleId) {
        // Sale committed — jump to the receipt, which auto-prints and saves a PDF.
        setLines([]);
        setDiscount(0);
        setCustomerId(null);
        setKhqr(null);
        router.push(`/pos/receipt/${r.saleId}?autoprint=1`);
        return;
      }
      if (r?.status === "expired") {
        setKhqrError("The QR expired before payment — start again.");
        setKhqr(null);
        return;
      }
      if (r?.status === "error") {
        setKhqrError(r.message ?? "Couldn't check payment. Retrying…");
      }
      timer = setTimeout(poll, 2200);
    };
    timer = setTimeout(poll, 2200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [khqr, router]);

  // ---- success screen ----
  if (result) {
    return (
      <div className="max-w-md mx-auto text-center py-16 animate-rise">
        <span className="inline-flex w-16 h-16 rounded-full bg-jade/10 border border-jade/30 text-jade items-center justify-center mb-5">
          <Icon name="check" className="w-7 h-7" />
        </span>
        <h1 className="font-display text-2xl text-white tracking-wide">Sale Complete</h1>
        <p className="text-fog mt-2 num">Receipt {result.number}</p>
        {result.changeDue! > 0 && (
          <p className="mt-4 text-lg">
            <span className="text-fog">Change due: </span>
            <span className="num text-gold-soft font-semibold">{money(result.changeDue!)}</span>
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link href={`/pos/receipt/${result.saleId}`} className="btn-ghost px-4 py-2.5 text-sm">
            <Icon name="receipt" className="w-4 h-4" /> View receipt
          </Link>
          <button onClick={() => setResult(null)} className="btn-gold px-5 py-2.5 text-sm">
            <Icon name="plus" className="w-4 h-4" /> New sale
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8.5rem)] lg:h-[calc(100vh-7.5rem)]">
      {/* ---- Product browser ---- */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Icon name="scan" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
              className="input pl-9"
              placeholder="Search or scan barcode / SKU…"
              autoFocus
            />
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap mb-3">
          {CATS.map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={`px-3 py-1.5 rounded-full text-[12px] border transition-colors ${
                cat === c.key ? "bg-gold/12 border-gold/35 text-gold-soft" : "border-edge text-fog hover:text-mist"
              }`}
            >
              {c.label}
            </button>
          ))}
          <span className="w-px bg-edge mx-1" />
          <button
            onClick={() => setGame("")}
            className={`px-3 py-1.5 rounded-full text-[12px] border transition-colors ${
              game === "" ? "bg-gold/12 border-gold/35 text-gold-soft" : "border-edge text-fog hover:text-mist"
            }`}
          >
            All games
          </button>
          {games.map((g) => (
            <button
              key={g}
              onClick={() => setGame(game === g ? "" : g)}
              className={`px-3 py-1.5 rounded-full text-[12px] border transition-colors ${
                game === g ? "bg-gold/12 border-gold/35 text-gold-soft" : "border-edge text-fog hover:text-mist"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {filtered.map((p) => {
              const line = inCart(p.id);
              const out = p.stock < 1;
              return (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  disabled={out}
                  className={`card card-hover text-left p-3 relative ${out ? "opacity-40 cursor-not-allowed" : ""} ${
                    line ? "border-gold/40" : ""
                  }`}
                >
                  {line && (
                    <span className="absolute top-2 right-2 z-10 min-w-[22px] h-[22px] px-1 rounded-full bg-gold text-ink text-[11px] font-bold flex items-center justify-center num">
                      {line.qty}
                    </span>
                  )}
                  {/* Photo makes items recognisable at a glance when a customer asks for one */}
                  <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-panel-2 border border-edge mb-2 flex items-center justify-center">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Icon
                        name={p.category === "graded" ? "graded" : p.category === "single" ? "card" : "inventory"}
                        className="w-7 h-7 text-fog/50"
                      />
                    )}
                  </div>
                  <p className="text-[13px] text-white leading-snug line-clamp-2">{p.name}</p>
                  <p className="text-[11px] text-fog mt-1 truncate">
                    {p.game}
                    {p.grade_company ? ` · ${p.grade_company} ${p.grade}` : p.condition ? ` · ${p.condition}` : ""}
                  </p>
                  <div className="flex items-end justify-between mt-2">
                    <span className="num text-gold-soft font-semibold text-[15px]">{money(p.price)}</span>
                    <span className={`text-[11px] num ${p.stock <= 2 ? "text-amberish" : "text-fog"}`}>{out ? "OUT" : `${p.stock} in stock`}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="text-center text-fog py-16">No products match.</p>}
        </div>
      </div>

      {/* ---- Cart (desktop side panel) ---- */}
      <div className={`${cartOpenMobile ? "fixed inset-0 z-50 bg-black/70 flex items-end lg:static lg:bg-transparent" : "hidden"} lg:flex lg:w-[360px] lg:shrink-0`}
        onClick={(e) => { if (e.target === e.currentTarget) setCartOpenMobile(false); }}
      >
        <div className="card w-full lg:h-full flex flex-col max-h-[85vh] lg:max-h-none rounded-b-none lg:rounded-card animate-rise">
          <header className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-edge">
            <h2 className="text-[13px] uppercase tracking-[0.16em] text-mist">Current Sale</h2>
            <div className="flex items-center gap-2">
              {lines.length > 0 && (
                <button onClick={() => setLines([])} className="text-fog hover:text-ruby" title="Clear cart">
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              )}
              <button className="lg:hidden text-fog hover:text-white" onClick={() => setCartOpenMobile(false)}>
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {lines.length === 0 && <p className="text-fog text-sm text-center py-10">Tap products to add them.</p>}
            {lines.map((l) => (
              <div key={l.product.id} className="flex items-center gap-2">
                {l.product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.product.image} alt="" className="w-9 h-9 rounded-md object-cover border border-edge shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded-md bg-panel-2 border border-edge text-fog/60 flex items-center justify-center shrink-0">
                    <Icon name="card" className="w-4 h-4" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white truncate">{l.product.name}</p>
                  <p className="text-[11px] text-fog num">{money(l.product.price)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(l.product.id, l.qty - 1)} className="btn-ghost w-7 h-7"><Icon name="minus" className="w-3.5 h-3.5" /></button>
                  <span className="num w-7 text-center text-sm">{l.qty}</span>
                  <button onClick={() => setQty(l.product.id, l.qty + 1)} className="btn-ghost w-7 h-7" disabled={l.qty >= l.product.stock}>
                    <Icon name="plus" className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="num text-sm w-[70px] text-right text-white">{money(l.product.price * l.qty)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-edge px-4 py-3 space-y-3">
            <select className="input" value={customerId ?? ""} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Walk-in customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <span className="text-[12px] text-fog w-16">Discount</span>
              {[0, 5, 10].map((p) => (
                <button
                  key={p}
                  onClick={() => setDiscount(Math.round((subtotal * p) / 100))}
                  className={`px-2.5 py-1 rounded-md text-[12px] border ${
                    discount === Math.round((subtotal * p) / 100) && (p > 0 || discount === 0)
                      ? "border-gold/40 text-gold-soft bg-gold/10"
                      : "border-edge text-fog"
                  }`}
                >
                  {p === 0 ? "None" : `${p}%`}
                </button>
              ))}
              <input
                type="number" min={0} step="0.01" placeholder="$"
                className="input !w-20 !py-1 text-right num"
                value={discount ? (discount / 100).toString() : ""}
                onChange={(e) => setDiscount(Math.min(subtotal, Math.round((parseFloat(e.target.value) || 0) * 100)))}
              />
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-mist"><span>Subtotal</span><span className="num">{money(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-jade"><span>Discount</span><span className="num">−{money(discount)}</span></div>}
              <div className="flex justify-between text-white text-lg font-semibold pt-1 border-t border-edge">
                <span>Total</span><span className="num text-gold-soft">{money(total)}</span>
              </div>
            </div>

            {error && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2">{error}</p>}

            <button className="btn-gold w-full py-3 text-[15px] disabled:opacity-50" disabled={lines.length === 0 || pending} onClick={() => setPayOpen(true)}>
              <Icon name="money" className="w-4 h-4" /> Charge {money(total)}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile cart toggle */}
      {!cartOpenMobile && (
        <button
          onClick={() => setCartOpenMobile(true)}
          className="lg:hidden fixed bottom-20 right-4 z-40 btn-gold rounded-full px-5 py-3 shadow-pop"
        >
          <Icon name="pos" className="w-4 h-4" />
          <span className="num">{itemCount}</span> · {money(total)}
        </button>
      )}

      {/* ---- Payment modal ---- */}
      {payOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/75 animate-fadein" onClick={() => !pending && !khqr && setPayOpen(false)} />
          <div className="relative card shadow-pop w-full max-w-md p-6 animate-rise">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg tracking-wide text-white">Payment</h2>
              <button onClick={() => setPayOpen(false)} className="text-fog hover:text-white disabled:opacity-40" disabled={pending || !!khqr}>
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <p className="text-center mb-5">
              <span className="block text-[11px] uppercase tracking-[0.18em] text-fog mb-1">Amount due</span>
              <span className="num text-4xl font-semibold text-gold-soft">{money(total)}</span>
            </p>

            {khqr ? (
              <div className="flex flex-col items-center animate-rise">
                <div className="bg-white p-3 rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={khqr.image} alt="KHQR" className="w-52 h-52" />
                </div>
                <p className="text-white text-sm mt-4 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-jade animate-pulse" /> Waiting for customer to pay…
                </p>
                <p className="text-fog text-[12px] mt-1 text-center">
                  Customer scans on the display screen with any bank app (ABA, ACLEDA, Wing…). It prints automatically once paid.
                </p>
                {khqr.ref && <p className="text-fog text-[11px] mt-2 num">Ref {khqr.ref}</p>}
                {khqrError && <p className="text-amberish text-[12px] mt-3 text-center">{khqrError}</p>}
                <button onClick={cancelQr} className="btn-ghost px-4 py-2 text-sm mt-5 text-ruby/80 hover:text-ruby">
                  Cancel payment
                </button>
              </div>
            ) : (
            <>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {(["cash", "card", "qr"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`py-2 rounded-lg text-[12px] font-medium border transition-colors ${
                    method === m ? "bg-gold/12 border-gold/40 text-gold-soft" : "border-edge text-fog hover:text-mist"
                  }`}
                >
                  {m === "cash" ? "Cash" : m === "card" ? "Card" : "QR Pay"}
                </button>
              ))}
            </div>

            {method === "cash" && (
              <div className="mb-4">
                <label className="field">
                  <span>Cash received</span>
                  <input
                    type="number" step="0.01" min={0} className="input num text-right text-lg"
                    value={tendered} onChange={(e) => setTendered(e.target.value)} autoFocus
                    placeholder={(total / 100).toFixed(2)}
                  />
                </label>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[total, Math.ceil(total / 500) * 500, Math.ceil(total / 2000) * 2000, Math.ceil(total / 10000) * 10000]
                    .filter((v, i, a) => a.indexOf(v) === i && v >= total)
                    .slice(0, 4)
                    .map((v) => (
                      <button key={v} onClick={() => setTendered((v / 100).toFixed(2))} className="btn-ghost px-3 py-1.5 text-[12px] num">
                        {money(v)}
                      </button>
                    ))}
                </div>
                <p className="mt-3 text-sm flex justify-between">
                  <span className="text-fog">Change due</span>
                  <span className="num text-jade font-semibold">{money(changeDue)}</span>
                </p>
              </div>
            )}
            {method === "card" && (
              <p className="text-[13px] text-fog mb-4">Process {money(total)} on the card terminal, then confirm.</p>
            )}
            {method === "qr" && (
              <p className="text-[13px] text-fog mb-4">Show a KHQR — the customer scans it on the display screen and it prints automatically once paid.</p>
            )}

            {error && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 mb-3">{error}</p>}

            <button
              onClick={method === "qr" ? startQr : submit}
              disabled={pending || (method === "cash" && tenderedCents < total)}
              className="btn-gold w-full py-3 disabled:opacity-50"
            >
              {pending ? "Please wait…" : method === "qr" ? "Show KHQR to customer" : "Confirm payment"}
            </button>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
