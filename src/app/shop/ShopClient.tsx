"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  image2: string | null;
  image3: string | null;
  description: string | null;
}

const CATS = [
  { key: "", label: "All" },
  { key: "sealed", label: "Boxes & Packs" },
  { key: "single", label: "Singles" },
  { key: "graded", label: "Graded Slabs" },
  { key: "accessory", label: "Accessories" },
];

const SORTS = [
  { key: "new", label: "Newest" },
  { key: "low", label: "Price: Low → High" },
  { key: "high", label: "Price: High → Low" },
];

const catLabel = (k: string) => CATS.find((c) => c.key === k)?.label ?? k;
const imgsOf = (p: ShopProduct) => [p.image, p.image2, p.image3].filter(Boolean) as string[];

export function ShopClient({
  products,
  shopName,
  tagline,
  logo,
  welcome,
  phone,
  address,
  telegramUser,
  telegramReady,
}: {
  products: ShopProduct[];
  shopName: string;
  tagline: string;
  logo: string | null;
  welcome: string;
  phone: string;
  address: string;
  telegramUser: string;
  telegramReady: boolean;
}) {
  const [q, setQ] = useState("");
  const [game, setGame] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("new");
  const [favOnly, setFavOnly] = useState(false);
  const [favs, setFavs] = useState<Set<number>>(new Set());
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<ShopProduct | null>(null);
  const [detailImg, setDetailImg] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [name, setName] = useState("");
  const [phoneIn, setPhoneIn] = useState("");
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<PlaceOrderResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Favourites persist on the device.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("hoshi_favs");
      if (raw) setFavs(new Set(JSON.parse(raw) as number[]));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("hoshi_favs", JSON.stringify([...favs])); } catch { /* ignore */ }
  }, [favs]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 220);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const games = useMemo(() => Array.from(new Set(products.map((p) => p.game))), [products]);
  const newestIds = useMemo(() => new Set(products.slice(0, 6).map((p) => p.id)), [products]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = products.filter(
      (p) =>
        (!game || p.game === game) &&
        (!cat || p.category === cat) &&
        (!favOnly || favs.has(p.id)) &&
        (!needle || p.name.toLowerCase().includes(needle) || (p.set_name ?? "").toLowerCase().includes(needle))
    );
    if (sort === "low") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "high") list = [...list].sort((a, b) => b.price - a.price);
    // "new" keeps the id-desc order from the server.
    return list;
  }, [products, q, game, cat, favOnly, favs, sort]);

  const featured = useMemo(() => products.filter((p) => p.stock > 0).slice(0, 10), [products]);
  const filtering = !!(q || game || cat || favOnly);

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
  const toggleFav = (id: number) =>
    setFavs((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const scrollToGrid = () => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function placeOrder() {
    setErr(null);
    if (!name.trim() || !phoneIn.trim()) { setErr("Please enter your name and phone number."); return; }
    setSubmitting(true);
    try {
      const res = await placeWebOrderAction({ name, phone: phoneIn, note, location, items: cartLines.map((l) => ({ productId: l.product.id, qty: l.qty })) });
      if (!res.ok) { setErr(res.error ?? "Something went wrong. Please try again."); return; }
      if (!res.usesBot && res.orderText) {
        try { await navigator.clipboard.writeText(res.orderText); } catch { /* ignore */ }
      }
      setDone(res);
      setCart({});
      // Take the customer straight to the bot to pay — no extra tap needed.
      if (res.usesBot && res.telegramLink) {
        setTimeout(() => { window.location.href = res.telegramLink!; }, 400);
      }
    } catch {
      setErr("Couldn't place the order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- success ----------
  if (done) {
    return (
      <main className="min-h-screen bg-ink text-white flex items-center justify-center p-5">
        <div className="hero-aura absolute inset-0 pointer-events-none" />
        <div className="relative card shadow-pop max-w-sm w-full text-center p-8 animate-rise">
          <div className="w-20 h-20 rounded-full badge-foil grid place-items-center mx-auto mb-5 pop-in">
            <svg viewBox="0 0 24 24" className="w-10 h-10 text-gold" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h1 className="font-display text-2xl tracking-[0.08em]">Order Placed</h1>
          <p className="text-gold-soft num mt-1">{done.number}</p>
          <p className="text-mist text-sm mt-4">
            {done.usesBot
              ? "Taking you to our Telegram bot to pay… If it doesn't open, tap below."
              : done.telegramLink
              ? "Tap below to open our Telegram — your order is copied, just paste and send."
              : "We'll contact you on the phone number you provided."}
          </p>
          {done.telegramLink && (
            <a href={done.telegramLink} target="_blank" rel="noopener" className="btn-gold w-full py-3 mt-5 justify-center">Open Telegram to pay</a>
          )}
          <button onClick={() => setDone(null)} className="btn-ghost w-full py-2.5 mt-2 justify-center text-sm">Back to shop</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-white pb-32">
      {/* Sticky header — appears on scroll */}
      <header className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${scrolled ? "glass border-b border-edge py-2.5" : "py-3 bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-3">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5 min-w-0">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <span className="w-8 h-8 rounded-lg badge-foil grid place-items-center text-gold text-sm">★</span>
            )}
            <span className={`font-display tracking-[0.14em] text-gold-grad text-sm truncate transition-opacity ${scrolled ? "opacity-100" : "opacity-0 sm:opacity-100"}`}>{shopName.toUpperCase()}</span>
          </button>
          <div className="flex-1" />
          <button onClick={() => setCartOpen(true)} className="relative btn-ghost px-3.5 py-2 text-sm">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M6 6 5 3H2" /></svg>
            <span className="hidden sm:inline">Cart</span>
            {count > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-gold text-ink text-[11px] font-bold grid place-items-center pop-in">{count}</span>}
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="hero-aura absolute inset-0" />
        <div className="relative max-w-6xl mx-auto px-5 pt-24 pb-14 sm:pt-32 sm:pb-20 text-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-6 floaty shadow-pop" />
          ) : (
            <span className="w-20 h-20 rounded-2xl badge-foil grid place-items-center text-gold text-3xl mx-auto mb-6 floaty">★</span>
          )}
          <p className="text-[11px] uppercase tracking-[0.4em] text-gold-dim mb-3">Trading Card Boutique</p>
          <h1 className="font-display text-4xl sm:text-6xl tracking-[0.06em] leading-[1.05]">
            <span className="text-gold-grad">{shopName.toUpperCase()}</span>
          </h1>
          <p className="text-mist mt-4 max-w-md mx-auto text-sm sm:text-base">{welcome || tagline || "Chase the hits. Collect the best. Authentic Japanese product, delivered."}</p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <button onClick={scrollToGrid} className="btn-gold px-7 py-3 text-sm">Shop the collection</button>
            {telegramUser && (
              <a href={`https://t.me/${telegramUser}`} target="_blank" rel="noopener" className="btn-ghost px-5 py-3 text-sm">Chat with us</a>
            )}
          </div>
          <div className="flex items-center justify-center gap-6 sm:gap-10 mt-10 text-center">
            {[["Products", String(products.length)], ["Games", String(games.length)], ["Pay via", "Telegram"]].map(([l, v]) => (
              <div key={l}>
                <p className="font-display text-xl sm:text-2xl text-gold-soft">{v}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-fog mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rule-gold max-w-4xl mx-auto" />
      </section>

      {/* Featured — new arrivals */}
      {!filtering && featured.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pt-10">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-gold-dim">Just In</p>
              <h2 className="font-display text-2xl tracking-[0.05em] mt-1">New Arrivals</h2>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-5 px-5 snap-x">
            {featured.map((p) => (
              <button
                key={p.id}
                onClick={() => { setDetail(p); setDetailImg(0); }}
                className="shop-card card overflow-hidden shrink-0 w-40 snap-start text-left"
              >
                <div className="aspect-square bg-panel-2 overflow-hidden relative">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} className="shop-card-img w-full h-full object-cover" />
                  ) : <span className="grid place-items-center h-full text-fog text-3xl">★</span>}
                  <span className="absolute top-2 left-2 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-jade/20 text-jade border border-jade/30">NEW</span>
                </div>
                <div className="p-2.5">
                  <p className="text-[12px] text-white line-clamp-1">{p.name}</p>
                  <p className="num text-gold-soft font-semibold text-sm mt-0.5">{money(p.price)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Controls */}
      <section ref={gridRef} className="max-w-6xl mx-auto px-5 pt-10 scroll-mt-20">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-fog" fill="none" stroke="currentColor" strokeWidth={1.7}><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-10 py-3" placeholder="Search cards, boxes, sets…" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 items-center">
            {CATS.map((c) => (
              <button key={c.key} onClick={() => setCat(c.key)}
                className={`px-3.5 py-2 rounded-full text-[12px] whitespace-nowrap border transition-colors shrink-0 ${cat === c.key ? "badge-foil text-gold-soft" : "border-edge text-fog hover:text-mist"}`}>
                {c.label}
              </button>
            ))}
            <span className="w-px h-5 bg-edge mx-1 shrink-0" />
            <button onClick={() => setFavOnly((v) => !v)}
              className={`px-3.5 py-2 rounded-full text-[12px] whitespace-nowrap border transition-colors shrink-0 flex items-center gap-1.5 ${favOnly ? "badge-foil text-gold-soft" : "border-edge text-fog hover:text-mist"}`}>
              <Heart filled={favOnly} /> Favourites
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto">
              {games.map((g) => (
                <button key={g} onClick={() => setGame(game === g ? "" : g)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap border transition-colors shrink-0 ${game === g ? "border-gold/40 text-gold-soft bg-gold/[0.08]" : "border-edge text-fog hover:text-mist"}`}>
                  {g}
                </button>
              ))}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="input w-auto py-2 text-[12px] shrink-0">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-3">✦</p>
            <p className="text-mist">Nothing here yet — try another search or category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 mt-6">
            {filtered.map((p, i) => {
              const qty = cart[p.id] ?? 0;
              const soldOut = p.stock <= 0;
              const graded = p.grade_company && p.grade;
              return (
                <div key={p.id} className={`shop-card card overflow-hidden flex flex-col animate-rise ${soldOut ? "opacity-70" : ""}`} style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
                  <div className="relative">
                    <button onClick={() => { setDetail(p); setDetailImg(0); setZoom(false); }} className="block aspect-square bg-panel-2 overflow-hidden w-full">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} className={`shop-card-img w-full h-full object-cover ${soldOut ? "grayscale" : ""}`} />
                      ) : <span className="grid place-items-center h-full text-fog text-4xl">★</span>}
                    </button>
                    {/* badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                      {soldOut && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/70 text-mist border border-edge-2">SOLD OUT</span>}
                      {!soldOut && newestIds.has(p.id) && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-jade/20 text-jade border border-jade/30">NEW</span>}
                      {graded && <span className="holo text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full badge-foil">{p.grade_company} {p.grade}</span>}
                      {!soldOut && !graded && p.stock <= 3 && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-amberish/15 text-amberish border border-amberish/30">LOW STOCK</span>}
                    </div>
                    <button onClick={() => toggleFav(p.id)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur grid place-items-center hover:bg-black/70" aria-label="Favourite">
                      <Heart filled={favs.has(p.id)} />
                    </button>
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <button onClick={() => { setDetail(p); setDetailImg(0); setZoom(false); }} className="text-left">
                      <p className="text-[13px] text-white leading-snug line-clamp-2 hover:text-gold-soft transition-colors">{p.name}</p>
                    </button>
                    <p className="text-[11px] text-fog mt-0.5 truncate">
                      {[p.set_name, p.condition, p.rarity].filter(Boolean).join(" · ") || p.game}
                    </p>
                    <div className="flex items-end justify-between mt-auto pt-2">
                      <p className="num text-gold-soft font-semibold">{money(p.price)}</p>
                    </div>
                    <div className="mt-2">
                      {soldOut ? (
                        <button disabled className="w-full py-1.5 text-[12px] rounded-lg border border-edge text-fog cursor-not-allowed">Sold out</button>
                      ) : qty === 0 ? (
                        <button onClick={() => add(p.id)} className="btn-gold w-full py-1.5 text-[12px]">Add to cart</button>
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
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-5 mt-20">
        <div className="rule-gold mb-8" />
        <div className="grid sm:grid-cols-3 gap-6 text-center sm:text-left">
          <div>
            <p className="font-display text-lg text-gold-grad tracking-wide">{shopName.toUpperCase()}</p>
            <p className="text-fog text-[12px] mt-1">{tagline}</p>
          </div>
          <div className="text-[12px] text-fog space-y-1">
            <p className="text-mist uppercase tracking-[0.2em] text-[10px] mb-1.5">Visit / Contact</p>
            {address && <p>{address}</p>}
            {phone && <p className="num">{phone}</p>}
            {telegramUser && <a href={`https://t.me/${telegramUser}`} target="_blank" rel="noopener" className="text-gold-dim hover:text-gold">@{telegramUser}</a>}
          </div>
          <div className="text-[12px] text-fog space-y-1.5">
            <p className="text-mist uppercase tracking-[0.2em] text-[10px] mb-1.5">Why shop with us</p>
            <p>✦ Authentic Japanese product</p>
            <p>✦ Order &amp; pay easily on Telegram</p>
            <p>✦ Trusted local card shop</p>
          </div>
        </div>
        <p className="text-center text-fog text-[11px] mt-10 pb-8">© {new Date().getFullYear()} {shopName}. Chase the hits. ★</p>
      </footer>

      {/* Sticky cart bar */}
      {count > 0 && !cartOpen && !detail && (
        <button onClick={() => setCartOpen(true)} className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 btn-gold px-6 py-3.5 shadow-pop flex items-center gap-3 animate-rise">
          <span className="min-w-6 h-6 px-1 rounded-full bg-ink/20 text-[12px] font-bold grid place-items-center">{count}</span>
          Checkout · {money(total)}
        </button>
      )}

      {detail && <Detail p={detail} imgs={imgsOf(detail)} idx={detailImg} setIdx={setDetailImg} zoom={zoom} setZoom={setZoom}
        qty={cart[detail.id] ?? 0} setQty={setQty} add={add} fav={favs.has(detail.id)} toggleFav={toggleFav}
        onClose={() => setDetail(null)} onCart={() => { setDetail(null); setCartOpen(true); }} newest={newestIds.has(detail.id)} />}

      {cartOpen && <CartDrawer lines={cartLines} total={total} setQty={setQty} onClose={() => setCartOpen(false)}
        name={name} setName={setName} phone={phoneIn} setPhone={setPhoneIn} note={note} setNote={setNote}
        location={location} setLocation={setLocation}
        submitting={submitting} err={err} placeOrder={placeOrder} telegramReady={telegramReady} />}
    </main>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`w-4 h-4 ${filled ? "text-gold fill-gold" : "text-mist"}`} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7}>
      <path d="M12 21s-7.5-4.6-10-9.2C.6 8.9 2 5.5 5.2 5.5c1.9 0 3.2 1.1 3.8 2.2h.2c.6-1.1 1.9-2.2 3.8-2.2 3.2 0 4.6 3.4 3.2 6.3C19.5 16.4 12 21 12 21z" transform="translate(0 -0.5)" />
    </svg>
  );
}

function Detail({ p, imgs, idx, setIdx, zoom, setZoom, qty, setQty, add, fav, toggleFav, onClose, onCart, newest }: {
  p: ShopProduct; imgs: string[]; idx: number; setIdx: (n: number) => void; zoom: boolean; setZoom: (b: boolean) => void;
  qty: number; setQty: (id: number, q: number) => void; add: (id: number) => void; fav: boolean; toggleFav: (id: number) => void;
  onClose: () => void; onCart: () => void; newest: boolean;
}) {
  const soldOut = p.stock <= 0;
  const graded = p.grade_company && p.grade;
  const meta = [p.set_name, p.condition, p.rarity, p.game].filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/85 animate-fadein" onClick={onClose} />
      <div className="relative card shadow-pop w-full sm:max-w-lg max-h-[94vh] overflow-y-auto animate-rise rounded-b-none sm:rounded-card">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80">×</button>
        <button onClick={() => toggleFav(p.id)} className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/60 grid place-items-center hover:bg-black/80"><Heart filled={fav} /></button>
        <div className={`bg-panel-2 grid place-items-center overflow-hidden ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`} onClick={() => setZoom(!zoom)}>
          {imgs[idx] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgs[idx]} alt={p.name} className={`w-full transition-transform duration-500 ${zoom ? "scale-150" : "scale-100"} ${soldOut ? "grayscale" : ""}`} style={{ aspectRatio: "1", objectFit: zoom ? "cover" : "contain" }} />
          ) : <span className="text-fog text-6xl py-24">★</span>}
        </div>
        {imgs.length > 1 && (
          <div className="flex gap-2 px-4 pt-3 justify-center">
            {imgs.map((im, i) => (
              <button key={i} onClick={() => { setIdx(i); setZoom(false); }} className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${i === idx ? "border-gold" : "border-edge"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="p-5">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {soldOut && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/70 text-mist border border-edge-2">SOLD OUT</span>}
            {!soldOut && newest && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-jade/20 text-jade border border-jade/30">NEW</span>}
            {graded && <span className="holo text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full badge-foil">{p.grade_company} {p.grade}</span>}
            <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full badge-foil text-gold-soft">{catLabel(p.category)}</span>
          </div>
          <h2 className="text-white font-medium text-xl leading-snug">{p.name}</h2>
          <p className="text-[12px] text-fog mt-1">{meta.join(" · ")}</p>
          <p className="num text-3xl text-gold-soft font-semibold mt-3 font-display">{money(p.price)}</p>
          <p className="text-[11px] text-fog num mt-0.5">{soldOut ? "Currently unavailable" : `${p.stock} in stock`}</p>
          {p.description && <p className="text-[13px] text-mist mt-4 whitespace-pre-line leading-relaxed">{p.description}</p>}
          <div className="mt-6">
            {soldOut ? (
              <button disabled className="w-full py-3 rounded-lg border border-edge text-fog cursor-not-allowed">Sold out</button>
            ) : qty === 0 ? (
              <button onClick={() => add(p.id)} className="btn-gold w-full py-3 justify-center">Add to cart</button>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setQty(p.id, qty - 1)} className="btn-ghost w-11 h-11 !rounded-lg text-lg">−</button>
                  <span className="num text-lg w-6 text-center">{qty}</span>
                  <button onClick={() => setQty(p.id, qty + 1)} disabled={qty >= p.stock} className="btn-ghost w-11 h-11 !rounded-lg text-lg disabled:opacity-40">+</button>
                </div>
                <button onClick={onCart} className="btn-gold flex-1 py-3 justify-center">View cart</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CartDrawer({ lines, total, setQty, onClose, name, setName, phone, setPhone, note, setNote, location, setLocation, submitting, err, placeOrder, telegramReady }: {
  lines: { product: ShopProduct; qty: number }[]; total: number; setQty: (id: number, q: number) => void; onClose: () => void;
  name: string; setName: (s: string) => void; phone: string; setPhone: (s: string) => void; note: string; setNote: (s: string) => void;
  location: string; setLocation: (s: string) => void;
  submitting: boolean; err: string | null; placeOrder: () => void; telegramReady: boolean;
}) {
  const [locating, setLocating] = useState(false);
  function useMyLocation() {
    if (!navigator.geolocation) { setLocation("Location not supported — please type your address."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocation(`https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`); setLocating(false); },
      () => { setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/80 animate-fadein" onClick={() => !submitting && onClose()} />
      <div className="relative card shadow-pop w-full sm:max-w-md max-h-[92vh] sm:max-h-none sm:h-full overflow-y-auto p-5 animate-rise rounded-b-none sm:rounded-none">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg tracking-[0.06em]">Your Cart</h2>
          <button onClick={onClose} className="text-fog hover:text-white text-2xl leading-none">×</button>
        </div>
        {lines.length === 0 ? (
          <p className="text-fog text-sm py-16 text-center">Your cart is empty.</p>
        ) : (
          <>
            <div className="space-y-2.5 mb-4">
              {lines.map((l) => (
                <div key={l.product.id} className="flex items-center gap-3">
                  {l.product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.product.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : <span className="w-12 h-12 rounded-lg bg-panel-2 grid place-items-center text-fog shrink-0">★</span>}
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
              <span className="num text-2xl font-semibold text-gold-soft font-display">{money(total)}</span>
            </div>
            <div className="space-y-3">
              <label className="field"><span>Your name *</span><input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Name" /></label>
              <label className="field"><span>Phone / Telegram *</span><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input num" placeholder="e.g. 012 345 678" /></label>
              <div className="field">
                <span>Delivery location</span>
                <div className="flex gap-2">
                  <input value={location} onChange={(e) => setLocation(e.target.value)} className="input flex-1" placeholder="Address or paste a Google Maps link" />
                  <button type="button" onClick={useMyLocation} disabled={locating} className="btn-ghost px-3 py-2 text-[12px] shrink-0 whitespace-nowrap disabled:opacity-60">
                    📍 {locating ? "…" : "Use my location"}
                  </button>
                </div>
                {location.startsWith("http") && <a href={location} target="_blank" rel="noopener" className="text-[11px] text-gold-dim hover:text-gold mt-1 inline-block">Location pinned ✓ — preview map</a>}
              </div>
              <label className="field"><span>Note (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Anything we should know?" /></label>
            </div>
            {err && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 mt-3">{err}</p>}
            <button onClick={placeOrder} disabled={submitting} className="btn-gold w-full py-3.5 mt-4 justify-center disabled:opacity-60">
              {submitting ? "Sending…" : `Order now · ${money(total)}`}
            </button>
            <p className="text-[11px] text-fog text-center mt-2">
              {telegramReady ? "We'll send your order to Telegram to arrange payment." : "We'll contact you to arrange payment."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
