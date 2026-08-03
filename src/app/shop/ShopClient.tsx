"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { money } from "@/lib/format";
import { priceOf, type StoreDiscount } from "@/lib/pricing";
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
  discount_type: string | null;
  discount_value: number | null;
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

export interface Promo {
  title: string;
  text: string;
  cta: string;
  link: string;
  image: string;
}

/** Turn a "HoshiHits" / "@HoshiHits" / "t.me/HoshiHits" input into a full URL. */
const fbUrl = (v: string) => {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes("facebook.com") || s.includes("fb.com")) return `https://${s.replace(/^\/+/, "")}`;
  return `https://facebook.com/${s.replace(/^@/, "")}`;
};
const tgUrl = (v: string) => {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes("t.me")) return `https://${s.replace(/^\/+/, "")}`;
  return `https://t.me/${s.replace(/^@/, "")}`;
};
const igUrl = (v: string) => {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes("instagram.com")) return `https://${s.replace(/^\/+/, "")}`;
  return `https://instagram.com/${s.replace(/^@/, "")}`;
};
const msgUrl = (v: string) => {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes("m.me") || s.includes("messenger.com")) return `https://${s.replace(/^\/+/, "")}`;
  return `https://m.me/${s.replace(/^@/, "")}`;
};

// Hero carousel slides — franchise-themed scenes (gradient art, no character IP).
const SLIDES = [
  {
    key: "pokemon",
    badge: "Pokémon TCG",
    title: "Unleash Rare Hits & Graded Slabs",
    subtitle: "Authentic Japanese Pokémon Cards & PSA 10 Gem Mint Grails",
    cta: "Shop Pokémon",
    emojis: ["⚡", "🔥", "✨"],
    bg: "radial-gradient(60% 90% at 20% 22%, rgba(245,158,11,0.50), transparent 60%), radial-gradient(70% 90% at 85% 28%, rgba(239,68,68,0.42), transparent 60%), radial-gradient(90% 100% at 50% 125%, rgba(59,130,246,0.34), transparent 60%), #0B1020",
  },
  {
    key: "onepiece",
    badge: "One Piece TCG",
    title: "Find Your Grail — One Piece TCG",
    subtitle: "Booster Boxes, Single Cards & Starter Decks Direct From Japan",
    cta: "Shop One Piece",
    emojis: ["🏴‍☠️", "⚔️", "🌊"],
    bg: "radial-gradient(60% 90% at 18% 25%, rgba(239,68,68,0.48), transparent 60%), radial-gradient(70% 90% at 82% 20%, rgba(59,130,246,0.48), transparent 60%), radial-gradient(95% 100% at 50% 128%, rgba(14,165,233,0.40), transparent 60%), #0B1020",
  },
  {
    key: "accessory",
    badge: "Protect & Elevate",
    title: "Protect & Elevate Your Collection",
    subtitle: "High-Grade Sleeves, Toploaders & Factory-Sealed Booster Boxes",
    cta: "Explore Accessories",
    emojis: ["📦", "🛡️", "💎"],
    bg: "radial-gradient(60% 90% at 20% 25%, rgba(139,92,246,0.50), transparent 60%), radial-gradient(70% 90% at 85% 24%, rgba(30,58,138,0.60), transparent 60%), radial-gradient(95% 100% at 50% 128%, rgba(245,158,11,0.28), transparent 60%), #0B1020",
  },
];

const BRANDS = [
  { kind: "all", label: "All Products" },
  { kind: "pokemon", label: "Pokémon TCG" },
  { kind: "onepiece", label: "One Piece TCG" },
  { kind: "graded", label: "Graded Slabs (PSA/BGS)" },
  { kind: "sealed", label: "Sealed Boxes" },
  { kind: "accessory", label: "Accessories" },
];

export function ShopClient({
  products,
  slideImages,
  slidePosters,
  shopName,
  tagline,
  logo,
  welcome,
  phone,
  address,
  telegramUser,
  telegramReady,
  storeDiscount,
  facebook,
  channel,
  instagram,
  messenger,
  telegramOrder,
  adminUser,
  bgImage,
  promo,
}: {
  products: ShopProduct[];
  slideImages: Record<string, string[]>;
  slidePosters: Record<string, string>;
  shopName: string;
  tagline: string;
  logo: string | null;
  welcome: string;
  phone: string;
  address: string;
  telegramUser: string;
  telegramReady: boolean;
  storeDiscount: StoreDiscount;
  facebook: string;
  channel: string;
  instagram: string;
  messenger: string;
  telegramOrder: string;
  adminUser: string;
  bgImage: string;
  promo: Promo;
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
  const [slide, setSlide] = useState(0);
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
    const onScroll = () => setScrolled(window.scrollY > 240);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Auto-rotate the hero carousel every 5s.
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  const games = useMemo(() => Array.from(new Set(products.map((p) => p.game))), [products]);
  const newestIds = useMemo(() => new Set(products.slice(0, 6).map((p) => p.id)), [products]);
  const gamePok = useMemo(() => games.find((g) => /pok[eé]?mon/i.test(g)), [games]);
  const gameOP = useMemo(() => games.find((g) => /one[\s-]?piece/i.test(g)), [games]);

  // Socials (full URLs) + whether the owner has posted a promo.
  const fb = fbUrl(facebook);
  const tg = tgUrl(channel);
  const ig = igUrl(instagram);
  const msg = msgUrl(messenger);
  const tgOrder = tgUrl(telegramOrder) || (adminUser ? `https://t.me/${adminUser}` : "");
  const adminLink = adminUser ? `https://t.me/${adminUser}` : "";
  const promoImg = promo.image?.startsWith("data:image/") ? promo.image : "";
  const hasPromo = !!(promo.title?.trim() || promo.text?.trim() || promoImg);

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
    return list;
  }, [products, q, game, cat, favOnly, favs, sort]);

  const featured = useMemo(() => products.filter((p) => p.stock > 0).slice(0, 10), [products]);
  const filtering = !!(q || game || cat || favOnly);

  // Effective web-shop price for a product (item discount, else store-wide sale).
  const pr = (p: ShopProduct) => priceOf(p, storeDiscount);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const cartLines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ product: byId.get(Number(id))!, qty }))
    .filter((l) => l.product);
  const total = cartLines.reduce((a, l) => a + pr(l.product).sale * l.qty, 0);
  const count = cartLines.reduce((a, l) => a + l.qty, 0);

  const setQty = (id: number, qty: number) => {
    const max = byId.get(id)?.stock ?? 0;
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(qty, max)) }));
  };
  const add = (id: number) => setQty(id, (cart[id] ?? 0) + 1);
  const toggleFav = (id: number) =>
    setFavs((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const scrollToGrid = () => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Quick brand/category presets used by the pills and carousel CTAs.
  const applyBrand = (kind: string, scroll = true) => {
    setFavOnly(false);
    if (kind === "all") { setGame(""); setCat(""); }
    else if (kind === "pokemon") { setCat(""); setGame(gamePok ?? "Pokémon"); }
    else if (kind === "onepiece") { setCat(""); setGame(gameOP ?? "One Piece"); }
    else { setGame(""); setCat(kind); }
    if (scroll) scrollToGrid();
  };
  const activeBrand =
    favOnly ? "" :
    cat === "graded" ? "graded" :
    cat === "sealed" ? "sealed" :
    cat === "accessory" ? "accessory" :
    game && gamePok && game === gamePok ? "pokemon" :
    game && gameOP && game === gameOP ? "onepiece" :
    !game && !cat ? "all" : "";

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
      <main className="min-h-screen sx-bg text-white flex items-center justify-center p-5">
        <div className="hero-aura absolute inset-0 pointer-events-none" />
        <div className="relative sx-card shadow-pop max-w-sm w-full text-center p-8 animate-rise">
          <div className="w-20 h-20 rounded-full badge-foil grid place-items-center mx-auto mb-5 pop-in">
            <svg viewBox="0 0 24 24" className="w-10 h-10 sx-amber" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h1 className="font-display text-2xl tracking-[0.08em]">Order Placed</h1>
          <p className="sx-amber num mt-1">{done.number}</p>
          <p className="text-[#9CA3AF] text-sm mt-4">
            {done.usesBot
              ? "Taking you to our Telegram bot to pay… If it doesn't open, tap below."
              : done.telegramLink
              ? "Tap below to open our Telegram — your order is copied, just paste and send."
              : "We'll contact you on the phone number you provided."}
          </p>
          {done.telegramLink && (
            <a href={done.telegramLink} target="_blank" rel="noopener" className="btn-amber w-full py-3 mt-5 justify-center">Open Telegram to pay</a>
          )}
          <button onClick={() => setDone(null)} className="btn-ghost w-full py-2.5 mt-2 justify-center text-sm">Back to shop</button>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Full-page background: owner-uploaded image (with a readability overlay),
          otherwise the holo ambient halos + floating cards. */}
      <div className="fixed inset-0 z-0 pointer-events-none sx-bg overflow-hidden" aria-hidden="true">
        {bgImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(9,12,26,0.86), rgba(9,12,26,0.64) 42%, rgba(9,12,26,0.9))" }} />
            <span className="spark" style={{ left: "7%", top: "24%", animationDelay: "0s" }} />
            <span className="spark" style={{ left: "93%", top: "30%", animationDelay: "1.2s" }} />
            <span className="spark" style={{ left: "50%", top: "9%", animationDelay: "2.1s" }} />
            <span className="spark" style={{ left: "88%", top: "84%", animationDelay: "0.7s" }} />
          </>
        ) : (
          <>
        <span className="absolute rounded-full" style={{ width: 460, height: 460, left: "-8%", top: "6%", filter: "blur(70px)", opacity: 0.20, background: "radial-gradient(circle,#22D3EE,transparent 70%)" }} />
        <span className="absolute rounded-full" style={{ width: 520, height: 520, right: "-10%", top: "2%", filter: "blur(70px)", opacity: 0.18, background: "radial-gradient(circle,#A855F7,transparent 70%)" }} />
        <span className="absolute rounded-full" style={{ width: 480, height: 480, left: "12%", top: "48%", filter: "blur(70px)", opacity: 0.15, background: "radial-gradient(circle,#6366F1,transparent 70%)" }} />
        <span className="absolute rounded-full" style={{ width: 560, height: 560, right: "-6%", top: "58%", filter: "blur(70px)", opacity: 0.16, background: "radial-gradient(circle,#EC4899,transparent 70%)" }} />
        <span className="absolute rounded-full" style={{ width: 500, height: 500, left: "40%", bottom: "-12%", filter: "blur(70px)", opacity: 0.15, background: "radial-gradient(circle,#38BDF8,transparent 70%)" }} />
        {/* Floating card silhouettes — concentrated in the side gutters. */}
        {[
          { w: 120, h: 168, left: "3%", top: "12%", r: "-14deg", d: "0s" },
          { w: 96, h: 134, left: "6%", top: "58%", r: "10deg", d: "1.4s" },
          { w: 84, h: 118, left: "1%", top: "80%", r: "-8deg", d: "2.6s" },
          { w: 128, h: 180, right: "3%", top: "16%", r: "12deg", d: "0.6s" },
          { w: 100, h: 140, right: "6%", top: "62%", r: "-10deg", d: "2s" },
          { w: 88, h: 124, right: "1.5%", top: "84%", r: "8deg", d: "3.2s" },
        ].map((c, i) => (
          <div key={i} className="float-card hidden lg:block" style={{ width: c.w, height: c.h, left: c.left, right: c.right, top: c.top, ["--r" as string]: c.r, animationDelay: c.d }} />
        ))}
        {/* Twinkling holo sparkles. */}
        {[
          ["5%", "26%", "0s"], ["9%", "44%", "1.1s"], ["3%", "70%", "2.2s"], ["11%", "88%", "0.7s"],
          ["95%", "22%", "1.6s"], ["92%", "48%", "0.4s"], ["97%", "72%", "2.6s"], ["90%", "90%", "1.9s"],
          ["50%", "8%", "1.2s"], ["70%", "94%", "3s"],
        ].map(([l, t, d], i) => (
          <span key={`s${i}`} className="spark" style={{ left: l, top: t, animationDelay: d }} />
        ))}
          </>
        )}
      </div>

      <main className="relative z-10 min-h-screen text-[#F9FAFB] pb-32">
      {/* Sticky header */}
      <header className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${scrolled ? "glass border-b border-[#27272A] py-2.5" : "py-3 bg-gradient-to-b from-black/60 to-transparent"}`}>
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex items-center gap-3">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5 min-w-0">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-black/30 p-0.5" />
            ) : (
              <span className="w-9 h-9 rounded-lg badge-foil grid place-items-center sx-amber text-sm">★</span>
            )}
            <span className="font-display tracking-[0.14em] text-gold-grad text-sm truncate">{shopName.toUpperCase()}</span>
          </button>
          <div className="flex-1" />
          <button onClick={() => setCartOpen(true)} className="relative btn-ghost px-3.5 py-2 text-sm">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M6 6 5 3H2" /></svg>
            <span className="hidden sm:inline">Cart</span>
            {count > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[#22d3ee] text-[#0B1020] text-[11px] font-bold grid place-items-center pop-in">{count}</span>}
          </button>
        </div>
      </header>

      {/* HERO CAROUSEL */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-20 sm:pt-24">
        <Carousel slide={slide} setSlide={setSlide} onCta={(kind) => applyBrand(kind)} slideImages={slideImages} slidePosters={slidePosters} />
        {/* welcome + quick stats */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mt-5">
          <p className="text-[#9CA3AF] text-sm sm:text-[15px] flex-1">{welcome || tagline || "Chase the hits. Collect the best. Authentic Japanese product, delivered."}</p>
          <div className="flex items-center gap-5 sm:gap-7">
            {[["Products", String(products.length)], ["Games", String(games.length)], ["Pay via", "Telegram"]].map(([l, v]) => (
              <div key={l} className="text-center">
                <p className="font-display text-lg sm:text-xl sx-amber">{v}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF]/70 mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="foil-rule mt-6" />
      </section>

      {/* PROMO / FOLLOW-US BANNER */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-8">
        <PromoBanner promo={{ ...promo, image: promoImg }} hasPromo={hasPromo} fb={fb} tg={tg} ig={ig} shopName={shopName} />
      </section>

      {/* Category tiles */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { key: "sealed", label: "Boxes & Packs", Icon: BoxIcon, from: "rgba(168,85,247,0.28)", ink: "#c4b5fd", glow: "rgba(168,85,247,0.45)" },
            { key: "single", label: "Singles", Icon: CardsIcon, from: "rgba(34,211,238,0.28)", ink: "#67e8f9", glow: "rgba(34,211,238,0.45)" },
            { key: "graded", label: "Graded Slabs", Icon: SlabIcon, from: "rgba(99,102,241,0.30)", ink: "#a5b4fc", glow: "rgba(99,102,241,0.45)" },
            { key: "accessory", label: "Accessories", Icon: GemIcon, from: "rgba(236,72,153,0.26)", ink: "#f9a8d4", glow: "rgba(236,72,153,0.45)" },
          ].map((c) => {
            const n = products.filter((p) => p.category === c.key).length;
            const on = cat === c.key;
            return (
              <button key={c.key} onClick={() => { setCat(c.key); setFavOnly(false); scrollToGrid(); }}
                className={`tile sx-card overflow-hidden p-4 sm:p-5 text-center ring-1 ${on ? "ring-white/25" : "ring-white/5"}`}
                style={{ backgroundImage: `linear-gradient(135deg, ${c.from}, transparent 70%)`, ...(on ? { boxShadow: `0 12px 40px -12px ${c.glow}` } : {}) }}>
                <div className="mb-1.5 sm:mb-2 flex justify-center" style={{ color: c.ink }}><c.Icon /></div>
                <p className="font-display tracking-[0.05em] text-[12px] sm:text-sm text-white leading-tight">{c.label}</p>
                <p className="text-[10px] sm:text-[11px] text-[#9CA3AF] mt-0.5 num">{n} item{n === 1 ? "" : "s"}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured — new arrivals */}
      {!filtering && featured.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] sx-amber">Just In</p>
              <h2 className="font-display text-2xl tracking-[0.05em] mt-1">New Arrivals</h2>
            </div>
          </div>
          <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 -mx-4 sm:-mx-6 px-4 sm:px-6 snap-x">
            {featured.map((p) => (
              <button key={p.id} onClick={() => { setDetail(p); setDetailImg(0); }}
                className="relative shop-card sx-card overflow-hidden shrink-0 w-40 sm:w-44 snap-start text-left">
                <div className="aspect-[3/4] card-slot overflow-hidden relative">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} className="shop-card-img w-full h-full object-contain p-2" />
                  ) : <span className="grid place-items-center h-full text-[#9CA3AF] text-3xl">★</span>}
                  <span className="absolute top-2 left-2 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-jade/20 text-jade border border-jade/30">NEW</span>
                </div>
                <div className="p-2.5">
                  <p className="text-[13px] text-white line-clamp-1">{p.name}</p>
                  {(() => { const pp = pr(p); return (
                    <p className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="num sx-amber font-bold text-[17px]">{money(pp.sale)}</span>
                      {pp.onSale && <span className="num text-[12px] text-[#9CA3AF] line-through">{money(pp.original)}</span>}
                    </p>
                  ); })()}
                </div>
                {pr(p).onSale && <span className="absolute top-2 right-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-ruby text-white shadow">{pr(p).badge}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Controls + Grid */}
      <section ref={gridRef} className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-12 scroll-mt-24">
        {/* Quick TCG brand filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 sm:-mx-6 px-4 sm:px-6">
          {BRANDS.map((b) => (
            <button key={b.kind} onClick={() => applyBrand(b.kind, false)}
              className={`px-4 py-2 rounded-full text-[15px] whitespace-nowrap border transition-colors shrink-0 font-medium ${
                activeBrand === b.kind
                  ? "border-[#22d3ee]/60 bg-[#22d3ee]/15 sx-amber"
                  : "border-[#27272A] text-[#9CA3AF] hover:text-white hover:border-[#3a3a40]"}`}>
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 mt-3">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" fill="none" stroke="currentColor" strokeWidth={1.7}><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-10 py-3 text-[15px] text-[#F9FAFB]" placeholder="Search cards, boxes, sets…" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {games.map((g) => (
                <button key={g} onClick={() => setGame(game === g ? "" : g)}
                  className={`px-3 py-1.5 rounded-lg text-[14px] whitespace-nowrap border transition-colors shrink-0 ${game === g ? "border-[#22d3ee]/50 sx-amber bg-[#22d3ee]/[0.1]" : "border-[#27272A] text-[#9CA3AF] hover:text-white"}`}>
                  {g}
                </button>
              ))}
              <button onClick={() => setFavOnly((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-[14px] whitespace-nowrap border transition-colors shrink-0 flex items-center gap-1.5 ${favOnly ? "border-[#22d3ee]/50 sx-amber bg-[#22d3ee]/[0.1]" : "border-[#27272A] text-[#9CA3AF] hover:text-white"}`}>
                <Heart filled={favOnly} /> Wishlist
              </button>
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="input w-auto py-2 text-[14px] shrink-0 text-[#F9FAFB]">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-3">✦</p>
            <p className="text-[#9CA3AF]">Nothing here yet — try another search or category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mt-6">
            {filtered.map((p, i) => {
              const qty = cart[p.id] ?? 0;
              const soldOut = p.stock <= 0;
              const graded = p.grade_company && p.grade;
              return (
                <div key={p.id} className={`shop-card sx-card overflow-hidden flex flex-col animate-rise ${soldOut ? "opacity-70" : ""}`} style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
                  <div className="relative">
                    <button onClick={() => { setDetail(p); setDetailImg(0); setZoom(false); }} className="block aspect-[3/4] card-slot overflow-hidden w-full">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} className={`shop-card-img w-full h-full object-contain p-2.5 ${soldOut ? "grayscale" : ""}`} />
                      ) : <span className="grid place-items-center h-full text-[#9CA3AF] text-4xl">★</span>}
                    </button>
                    {/* badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                      {pr(p).onSale && <span className="text-[10px] font-extrabold tracking-wide px-2 py-0.5 rounded-full bg-ruby text-white shadow">{pr(p).badge}</span>}
                      {soldOut && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/70 text-[#9CA3AF] border border-[#333]">SOLD OUT</span>}
                      {!soldOut && newestIds.has(p.id) && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-jade/20 text-jade border border-jade/30">NEW</span>}
                      {graded && <span className="psa-metal text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full">{p.grade_company} {p.grade}</span>}
                      {!soldOut && !graded && p.stock <= 3 && <span className="pulse-ring text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#22d3ee]/15 sx-amber border border-[#22d3ee]/40">LOW STOCK</span>}
                    </div>
                    <button onClick={() => toggleFav(p.id)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur grid place-items-center hover:bg-black/70" aria-label="Wishlist">
                      <Heart filled={favs.has(p.id)} />
                    </button>
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <button onClick={() => { setDetail(p); setDetailImg(0); setZoom(false); }} className="text-left">
                      <p className="text-[15px] lg:text-[17px] font-semibold text-[#F9FAFB] leading-snug line-clamp-2 hover:text-[#22d3ee] transition-colors">{p.name}</p>
                    </button>
                    <p className="text-[14px] text-[#9CA3AF]/75 mt-0.5 truncate">
                      {[p.set_name, p.condition, p.rarity].filter(Boolean).join(" · ") || p.game}
                    </p>
                    <div className="flex items-baseline gap-2 flex-wrap mt-auto pt-2">
                      <p className="num sx-amber font-bold text-[19px]">{money(pr(p).sale)}</p>
                      {pr(p).onSale && <p className="num text-[13px] text-[#9CA3AF] line-through">{money(pr(p).original)}</p>}
                    </div>
                    <div className="mt-2">
                      {soldOut ? (
                        <button disabled className="w-full py-2 text-[13px] rounded-lg border border-[#27272A] text-[#9CA3AF] cursor-not-allowed">Sold out</button>
                      ) : qty === 0 ? (
                        <button onClick={() => add(p.id)} className="btn-amber w-full py-2 text-[13px]">Add to cart</button>
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
      <footer className="max-w-[1440px] mx-auto px-4 sm:px-6 mt-20">
        <div className="rule-gold mb-8" />
        <div className="grid sm:grid-cols-3 gap-8 text-center sm:text-left">
          {/* Brand */}
          <div>
            <p className="font-display text-lg text-gold-grad tracking-wide">🇰🇭 {shopName.toUpperCase()}</p>
            <p className="text-[#9CA3AF] text-[13px] mt-1">{tagline || "Collect • Trade • Chase"}</p>
            {address && <p className="text-[#9CA3AF] text-[13px] mt-3">{address}</p>}
            {phone && <p className="text-[#9CA3AF] text-[13px] num">{phone}</p>}
          </div>

          {/* Order with us */}
          <div>
            <p className="text-white uppercase tracking-[0.2em] text-[10px] mb-3">Order with us</p>
            <div className="flex flex-col gap-2 items-stretch">
              {tgOrder && <FooterPill href={tgOrder} cls="btn-tg" icon={<TgIcon />} label="Telegram Order" />}
              {msg && <FooterPill href={msg} cls="btn-msg" icon={<MsgIcon />} label="Messenger Order" />}
              {adminLink && <FooterPill href={adminLink} cls="btn-ghost" icon={<TgIcon />} label={adminUser ? `Support @${adminUser}` : "Admin support"} />}
            </div>
          </div>

          {/* Follow us */}
          <div>
            <p className="text-white uppercase tracking-[0.2em] text-[10px] mb-3">Follow us</p>
            <div className="flex flex-col gap-2 items-stretch">
              {tg && <FooterPill href={tg} cls="btn-tg" icon={<TgIcon />} label="Telegram Channel" />}
              {fb && <FooterPill href={fb} cls="btn-fb" icon={<FbIcon />} label="Facebook Page" />}
              {ig && <FooterPill href={ig} cls="btn-ig" icon={<IgIcon />} label="Instagram" />}
            </div>
          </div>
        </div>
        <p className="text-center text-[#9CA3AF] text-[11px] mt-10 pb-8">© {new Date().getFullYear()} {shopName}. Collect • Trade • Chase ★</p>
      </footer>

      {/* Sticky cart bar */}
      {count > 0 && !cartOpen && !detail && (
        <button onClick={() => setCartOpen(true)} className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 btn-amber px-6 py-3.5 shadow-pop flex items-center gap-3 animate-rise">
          <span className="min-w-6 h-6 px-1 rounded-full bg-black/20 text-[12px] font-bold grid place-items-center">{count}</span>
          Checkout · {money(total)}
        </button>
      )}

      {detail && <Detail p={detail} imgs={imgsOf(detail)} idx={detailImg} setIdx={setDetailImg} zoom={zoom} setZoom={setZoom}
        qty={cart[detail.id] ?? 0} setQty={setQty} add={add} fav={favs.has(detail.id)} toggleFav={toggleFav} price={pr(detail)}
        onClose={() => setDetail(null)} onCart={() => { setDetail(null); setCartOpen(true); }} newest={newestIds.has(detail.id)} />}

      {cartOpen && <CartDrawer lines={cartLines} total={total} setQty={setQty} onClose={() => setCartOpen(false)} priceOfProduct={pr}
        name={name} setName={setName} phone={phoneIn} setPhone={setPhoneIn} note={note} setNote={setNote}
        location={location} setLocation={setLocation}
        submitting={submitting} err={err} placeOrder={placeOrder} telegramReady={telegramReady} />}
      </main>
    </>
  );
}

/* ---------------------------------- Carousel --------------------------------- */
function Carousel({ slide, setSlide, onCta, slideImages, slidePosters }: {
  slide: number; setSlide: (n: number) => void; onCta: (kind: string) => void;
  slideImages: Record<string, string[]>; slidePosters: Record<string, string>;
}) {
  const go = (d: number) => setSlide((slide + d + SLIDES.length) % SLIDES.length);
  return (
    <div className="carousel group relative h-[360px] sm:h-[420px] lg:h-[460px] ring-1 ring-[#27272A] shadow-pop">
      {SLIDES.map((s, i) => {
        const poster = slidePosters[s.key] ?? "";
        const imgs = (slideImages[s.key] ?? []).slice(0, 4);
        return (
        <div key={s.key} className={`c-slide ${i === slide ? "is-active" : ""}`} style={{ background: s.bg }} aria-hidden={i !== slide}>
          {/* holo flare */}
          {!poster && <div className="holo-flare absolute -top-16 -right-10 w-72 h-72 rounded-full" />}
          {/* Owner-uploaded poster wins; else fan the shop's own product photos. */}
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" aria-hidden="true" />
          ) : imgs.length > 0 ? (
            <div className="absolute right-0 top-0 h-full w-[62%] sm:w-[55%] hidden sm:flex items-center justify-center pointer-events-none" aria-hidden="true">
              <div className="relative w-full h-full flex items-center justify-center">
                {imgs.map((src, k) => {
                  const mid = (imgs.length - 1) / 2;
                  const off = k - mid;
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={k} src={src} alt=""
                      className="absolute w-28 lg:w-36 aspect-[3/4] object-cover rounded-xl ring-1 ring-white/20 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)]"
                      style={{ transform: `translateX(${off * 82}px) rotate(${off * 8}deg) translateY(${Math.abs(off) * 10}px)`, zIndex: 10 - Math.abs(off) }} />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="absolute right-[8%] top-1/2 -translate-y-1/2 hidden sm:block pointer-events-none" aria-hidden="true">
              <span className="font-display text-[7rem] lg:text-[9rem] leading-none text-white/10 tracking-tight">{s.badge.split(" ")[0]}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />
          <div className="relative h-full flex flex-col justify-center max-w-xl px-6 sm:px-10 lg:px-14">
            <span className="inline-flex w-fit items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-white/12 backdrop-blur text-white mb-4">{s.badge}</span>
            <h2 className="font-display text-3xl sm:text-5xl leading-[1.05] text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.6)]">{s.title}</h2>
            <p className="text-[#F9FAFB]/85 text-sm sm:text-base mt-3 max-w-md">{s.subtitle}</p>
            <button onClick={() => onCta(s.key)} className="btn-amber w-fit px-7 py-3 text-sm mt-6">{s.cta}</button>
          </div>
        </div>
        );
      })}

      {/* arrows */}
      <button onClick={() => go(-1)} aria-label="Previous" className="c-arrow absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur grid place-items-center text-white text-xl">‹</button>
      <button onClick={() => go(1)} aria-label="Next" className="c-arrow absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur grid place-items-center text-white text-xl">›</button>

      {/* dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        {SLIDES.map((s, i) => (
          <button key={s.key} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`}
            className={`c-dot h-2 rounded-full ${i === slide ? "w-7 bg-[#22d3ee]" : "w-2 bg-white/45 hover:bg-white/70"}`} />
        ))}
      </div>
    </div>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`w-4 h-4 ${filled ? "text-[#22d3ee] fill-[#22d3ee]" : "text-[#9CA3AF]"}`} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7}>
      <path d="M12 21s-7.5-4.6-10-9.2C.6 8.9 2 5.5 5.2 5.5c1.9 0 3.2 1.1 3.8 2.2h.2c.6-1.1 1.9-2.2 3.8-2.2 3.2 0 4.6 3.4 3.2 6.3C19.5 16.4 12 21 12 21z" transform="translate(0 -0.5)" />
    </svg>
  );
}

function FbIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-8h2.6l.4-3h-3V8.1c0-.86.24-1.45 1.5-1.45H17V4a20 20 0 0 0-2.3-.12c-2.3 0-3.9 1.4-3.9 4V10H8.3v3H10.8v8z" />
    </svg>
  );
}

/* Clean line icons that replace the emoji (category tiles, misc). */
function BoxIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M3 8l9-4 9 4v8l-9 4-9-4z" /><path d="M3 8l9 4 9-4M12 12v8" /></svg>);
}
function CardsIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><rect x="7" y="4" width="11" height="15" rx="2" transform="rotate(6 12 11)" /><rect x="4" y="6" width="11" height="15" rx="2" transform="rotate(-6 10 13)" /></svg>);
}
function SlabIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 7h6" /><circle cx="12" cy="14" r="2.5" /></svg>);
}
function GemIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M6 3h12l3 6-9 12L3 9z" /><path d="M3 9h18M9 3l-3 6 6 12M15 3l3 6-6 12" /></svg>);
}
function PinIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>);
}
function TgIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3 18.6 20c-.24 1.1-.9 1.36-1.83.85l-5.05-3.72-2.44 2.35c-.27.27-.5.5-1 .5l.36-5.14L18.9 6.16c.4-.36-.09-.56-.63-.2L6.75 13.2 1.8 11.66c-1.07-.34-1.1-1.07.23-1.58l19.32-7.45c.9-.32 1.68.22 1.55 1.67z" />
    </svg>
  );
}
function MsgIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.3 2 2 6.2 2 11.6c0 2.9 1.3 5.4 3.4 7.1V22l3.1-1.7c.8.2 1.7.3 2.5.3 5.7 0 10-4.2 10-9.6C21 6.2 17.7 2 12 2zm1 12.3-2.6-2.7-4.9 2.7 5.4-5.7 2.6 2.7 4.8-2.7-5.3 5.7z" />
    </svg>
  );
}
function IgIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Full-width brand pill used in the footer contact columns. */
function FooterPill({ href, cls, icon, label }: { href: string; cls: string; icon: ReactNode; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener"
      className={`${cls} rounded-lg px-3.5 py-2.5 text-[13px] font-medium flex items-center gap-2.5 justify-center sm:justify-start`}>
      {icon} {label}
    </a>
  );
}

/**
 * Promo / follow-us banner. Shows the owner's posted promo (headline, message,
 * image, button) when set; otherwise a bright "follow us" card. Always surfaces
 * the Facebook page + Telegram channel so customers can follow drops.
 */
function PromoBanner({ promo, hasPromo, fb, tg, ig, shopName }: {
  promo: Promo; hasPromo: boolean; fb: string; tg: string; ig: string; shopName: string;
}) {
  if (!hasPromo && !fb && !tg && !ig) return null;
  const title = hasPromo ? (promo.title?.trim() || "New drop!") : `Follow ${shopName}`;
  const text = hasPromo
    ? promo.text?.trim()
    : "Preorders, restocks & giveaways drop first on our Facebook and Telegram. Tap to follow so you never miss a hit.";
  const badge = hasPromo ? "Latest drop" : "Stay in the loop";

  return (
    <div className="relative rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-pop shine">
      <div className="aurora aurora-move absolute inset-0" />
      <div className="absolute inset-0 bg-black/25" />
      <div className="relative flex flex-col sm:flex-row items-stretch">
        {promo.image && (
          <div className="sm:w-2/5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promo.image} alt="" className="w-full h-44 sm:h-full object-cover" />
          </div>
        )}
        <div className="flex-1 p-5 sm:p-7">
          <span className="inline-block text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-white mb-3">{badge}</span>
          <h3 className="font-display text-2xl sm:text-3xl text-white leading-tight drop-shadow">{title}</h3>
          {text && <p className="text-white/90 text-sm mt-2 max-w-xl">{text}</p>}
          <div className="flex flex-wrap gap-2.5 mt-5">
            {hasPromo && promo.cta?.trim() && promo.link?.trim() && (
              <a href={promo.link.trim()} target="_blank" rel="noopener" className="btn-amber px-6 py-3 text-sm">{promo.cta.trim()}</a>
            )}
            {fb && <a href={fb} target="_blank" rel="noopener" className="btn-fb px-5 py-3 text-sm rounded-lg gap-2"><FbIcon /> Facebook</a>}
            {tg && <a href={tg} target="_blank" rel="noopener" className="btn-tg px-5 py-3 text-sm rounded-lg gap-2"><TgIcon /> Telegram</a>}
            {ig && <a href={ig} target="_blank" rel="noopener" className="btn-ig px-5 py-3 text-sm rounded-lg gap-2"><IgIcon /> Instagram</a>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ p, imgs, idx, setIdx, zoom, setZoom, qty, setQty, add, fav, toggleFav, price, onClose, onCart, newest }: {
  p: ShopProduct; imgs: string[]; idx: number; setIdx: (n: number) => void; zoom: boolean; setZoom: (b: boolean) => void;
  qty: number; setQty: (id: number, q: number) => void; add: (id: number) => void; fav: boolean; toggleFav: (id: number) => void;
  price: ReturnType<typeof priceOf>;
  onClose: () => void; onCart: () => void; newest: boolean;
}) {
  const soldOut = p.stock <= 0;
  const graded = p.grade_company && p.grade;
  const meta = [p.set_name, p.condition, p.rarity, p.game].filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/85 animate-fadein" onClick={onClose} />
      <div className="relative sx-card shadow-pop w-full sm:max-w-lg max-h-[94vh] overflow-y-auto animate-rise rounded-b-none sm:rounded-card">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80">×</button>
        <button onClick={() => toggleFav(p.id)} className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/60 grid place-items-center hover:bg-black/80"><Heart filled={fav} /></button>
        <div className={`card-slot grid place-items-center overflow-hidden ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`} onClick={() => setZoom(!zoom)}>
          {imgs[idx] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgs[idx]} alt={p.name} className={`w-full transition-transform duration-500 ${zoom ? "scale-150" : "scale-100"} ${soldOut ? "grayscale" : ""}`} style={{ aspectRatio: "3 / 4", objectFit: zoom ? "cover" : "contain", padding: zoom ? 0 : "1rem" }} />
          ) : <span className="text-[#9CA3AF] text-6xl py-24">★</span>}
        </div>
        {imgs.length > 1 && (
          <div className="flex gap-2 px-4 pt-3 justify-center">
            {imgs.map((im, i) => (
              <button key={i} onClick={() => { setIdx(i); setZoom(false); }} className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${i === idx ? "border-[#22d3ee]" : "border-[#27272A]"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="p-5">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {soldOut && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/70 text-[#9CA3AF] border border-[#333]">SOLD OUT</span>}
            {!soldOut && newest && <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-jade/20 text-jade border border-jade/30">NEW</span>}
            {graded && <span className="psa-metal text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full">{p.grade_company} {p.grade}</span>}
            {price.onSale && <span className="text-[9px] font-extrabold tracking-wide px-2 py-0.5 rounded-full bg-ruby text-white">{price.badge} SALE</span>}
            <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#22d3ee]/15 sx-amber border border-[#22d3ee]/30">{catLabel(p.category)}</span>
          </div>
          <h2 className="text-white font-semibold text-xl leading-snug">{p.name}</h2>
          <p className="text-[13px] text-[#9CA3AF] mt-1">{meta.join(" · ")}</p>
          <div className="flex items-baseline gap-2.5 mt-3">
            <p className="num text-3xl sx-amber font-bold font-display">{money(price.sale)}</p>
            {price.onSale && <p className="num text-lg text-[#9CA3AF] line-through">{money(price.original)}</p>}
            {price.onSale && <span className="text-[11px] font-bold text-jade">Save {money(price.off)}</span>}
          </div>
          <p className="text-[11px] text-[#9CA3AF] num mt-0.5">{soldOut ? "Currently unavailable" : `${p.stock} in stock`}</p>
          {p.description && <p className="text-[13px] text-[#9CA3AF] mt-4 whitespace-pre-line leading-relaxed">{p.description}</p>}
          <div className="mt-6">
            {soldOut ? (
              <button disabled className="w-full py-3 rounded-lg border border-[#27272A] text-[#9CA3AF] cursor-not-allowed">Sold out</button>
            ) : qty === 0 ? (
              <button onClick={() => add(p.id)} className="btn-amber w-full py-3 justify-center">Add to cart</button>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setQty(p.id, qty - 1)} className="btn-ghost w-11 h-11 !rounded-lg text-lg">−</button>
                  <span className="num text-lg w-6 text-center">{qty}</span>
                  <button onClick={() => setQty(p.id, qty + 1)} disabled={qty >= p.stock} className="btn-ghost w-11 h-11 !rounded-lg text-lg disabled:opacity-40">+</button>
                </div>
                <button onClick={onCart} className="btn-amber flex-1 py-3 justify-center">View cart</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CartDrawer({ lines, total, setQty, onClose, priceOfProduct, name, setName, phone, setPhone, note, setNote, location, setLocation, submitting, err, placeOrder, telegramReady }: {
  lines: { product: ShopProduct; qty: number }[]; total: number; setQty: (id: number, q: number) => void; onClose: () => void;
  priceOfProduct: (p: ShopProduct) => ReturnType<typeof priceOf>;
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
      <div className="relative sx-card shadow-pop w-full sm:max-w-md max-h-[92vh] sm:max-h-none sm:h-full overflow-y-auto p-5 animate-rise rounded-b-none sm:rounded-none">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg tracking-[0.06em]">Your Cart</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-white text-2xl leading-none">×</button>
        </div>
        {lines.length === 0 ? (
          <p className="text-[#9CA3AF] text-sm py-16 text-center">Your cart is empty.</p>
        ) : (
          <>
            <div className="space-y-2.5 mb-4">
              {lines.map((l) => { const lp = priceOfProduct(l.product); return (
                <div key={l.product.id} className="flex items-center gap-3">
                  {l.product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.product.image} alt="" className="w-12 h-12 rounded-lg object-contain bg-[#0B1020] border border-[#27272A] shrink-0" />
                  ) : <span className="w-12 h-12 rounded-lg bg-[#0B1020] grid place-items-center text-[#9CA3AF] shrink-0">★</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white truncate">{l.product.name}</p>
                    <p className="num text-[13px] flex items-baseline gap-1.5">
                      <span className="sx-amber font-semibold">{money(lp.sale)}</span>
                      {lp.onSale && <span className="text-[11px] text-[#9CA3AF] line-through">{money(lp.original)}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setQty(l.product.id, l.qty - 1)} className="btn-ghost w-7 h-7 !rounded-md">−</button>
                    <span className="num text-sm w-5 text-center">{l.qty}</span>
                    <button onClick={() => setQty(l.product.id, l.qty + 1)} disabled={l.qty >= l.product.stock} className="btn-ghost w-7 h-7 !rounded-md disabled:opacity-40">+</button>
                  </div>
                </div>
              ); })}
            </div>
            <div className="flex justify-between items-center border-t border-dashed border-[#27272A] pt-3 mb-4">
              <span className="text-[#9CA3AF]">Total</span>
              <span className="num text-2xl font-bold sx-amber font-display">{money(total)}</span>
            </div>
            <div className="space-y-3">
              <label className="field"><span>Your name *</span><input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Name" /></label>
              <label className="field"><span>Phone / Telegram *</span><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input num" placeholder="e.g. 012 345 678" /></label>
              <div className="field">
                <span>Delivery location</span>
                <div className="flex gap-2">
                  <input value={location} onChange={(e) => setLocation(e.target.value)} className="input flex-1" placeholder="Address or paste a Google Maps link" />
                  <button type="button" onClick={useMyLocation} disabled={locating} className="btn-ghost px-3 py-2 text-[12px] shrink-0 whitespace-nowrap disabled:opacity-60 inline-flex items-center gap-1.5">
                    <PinIcon /> {locating ? "…" : "Use my location"}
                  </button>
                </div>
                {location.startsWith("http") && <a href={location} target="_blank" rel="noopener" className="text-[11px] sx-amber hover:brightness-110 mt-1 inline-block">Location pinned ✓ — preview map</a>}
              </div>
              <label className="field"><span>Note (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Anything we should know?" /></label>
            </div>
            {err && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 mt-3">{err}</p>}
            <button onClick={placeOrder} disabled={submitting} className="btn-amber w-full py-3.5 mt-4 justify-center disabled:opacity-60">
              {submitting ? "Sending…" : `Order now · ${money(total)}`}
            </button>
            <p className="text-[11px] text-[#9CA3AF] text-center mt-2">
              {telegramReady ? "We'll send your order to Telegram to arrange payment." : "We'll contact you to arrange payment."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
