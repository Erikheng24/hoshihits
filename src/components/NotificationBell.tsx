"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { money } from "@/lib/format";

interface Order {
  id: number;
  number: string;
  customer_name: string;
  total: number;
  status: string;
  created_at: string;
}

/**
 * Admin notification bell for new web orders. Polls every ~15s; when a new order
 * arrives it plays a chime, shows a browser pop-up (if allowed), and bumps the
 * unread badge. The dropdown lists recent orders and links to Web Orders.
 */
export function NotificationBell() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [perm, setPerm] = useState<string>("default");
  const prevMax = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setSeen(Number(localStorage.getItem("hoshi_notif_seen") || "0"));
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    else setPerm("unsupported");
  }, []);

  function chime() {
    try {
      let ctx = audio.current;
      if (!ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        audio.current = ctx;
      }
      if (ctx.state === "suspended") ctx.resume();
      [880, 1174.7].forEach((f, i) => {
        const o = ctx!.createOscillator();
        const g = ctx!.createGain();
        o.type = "sine";
        o.frequency.value = f;
        const t0 = ctx!.currentTime + i * 0.15;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        o.connect(g);
        g.connect(ctx!.destination);
        o.start(t0);
        o.stop(t0 + 0.46);
      });
    } catch { /* audio blocked until a gesture — the badge + popup still fire */ }
  }

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { orders: Order[]; maxId: number };
        setOrders(data.orders);
        const prev = prevMax.current;
        if (prev !== null && data.maxId > prev) {
          const n = data.orders[0];
          chime();
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && n) {
            try { new Notification(`🛒 New order ${n.number}`, { body: `${n.customer_name} · ${money(n.total)}`, tag: "hoshi-order" }); } catch { /* ignore */ }
          }
        }
        prevMax.current = data.maxId;
      } catch { /* offline — try again next tick */ }
    };
    poll();
    const t = setInterval(poll, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = orders.filter((o) => o.id > seen).length;

  function markRead() {
    const max = orders.length ? orders[0].id : seen;
    setSeen(max);
    try { localStorage.setItem("hoshi_notif_seen", String(max)); } catch { /* ignore */ }
  }
  async function enableAlerts() {
    try {
      if (!audio.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audio.current = new AC();
      }
      audio.current.resume();
    } catch { /* ignore */ }
    if (typeof Notification !== "undefined") {
      try { setPerm(await Notification.requestPermission()); } catch { /* ignore */ }
    }
  }
  function openBell() {
    setOpen((v) => !v);
    // Unlock audio on this gesture so the chime can play on later polls.
    try { audio.current?.resume(); } catch { /* ignore */ }
  }
  function goto(_n: string) {
    markRead();
    setOpen(false);
    router.push("/web-orders");
  }

  const timeAgo = (s: string) => {
    const d = new Date(s.replace(" ", "T")).getTime();
    const mins = Math.max(0, Math.round((Date.now() - d) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={openBell} className="btn-ghost w-9 h-9 relative" title="Notifications" aria-label="Notifications">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-ruby text-white text-[10px] font-bold grid place-items-center pop-in">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[86vw] card shadow-pop z-50 animate-rise overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge">
            <span className="text-sm text-white font-medium">Notifications</span>
            {unread > 0 && <button onClick={markRead} className="text-[11px] text-gold-dim hover:text-gold">Mark all read</button>}
          </div>

          {perm !== "granted" && perm !== "unsupported" && (
            <button onClick={enableAlerts} className="w-full text-left px-4 py-2.5 bg-gold/[0.06] hover:bg-gold/[0.1] border-b border-edge text-[12px] text-gold-soft">
              🔔 Enable pop-up alerts &amp; sound
            </button>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {orders.length === 0 ? (
              <p className="text-fog text-[13px] text-center py-10">No orders yet.</p>
            ) : (
              orders.map((o) => (
                <button key={o.id} onClick={() => goto(o.number)}
                  className={`w-full text-left px-4 py-3 border-b border-edge/60 hover:bg-white/[0.03] transition-colors ${o.id > seen ? "bg-gold/[0.05]" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${o.id > seen ? "bg-gold" : "bg-transparent"}`} />
                    <span className="text-[13px] text-white flex-1 truncate">🛒 New order — {o.customer_name}</span>
                    <span className="num text-gold-soft text-[13px] shrink-0">{money(o.total)}</span>
                  </div>
                  <p className="text-[11px] text-fog num pl-4 mt-0.5">{o.number} · {timeAgo(o.created_at)}</p>
                </button>
              ))
            )}
          </div>
          <button onClick={() => { setOpen(false); router.push("/web-orders"); }} className="w-full text-center py-2.5 text-[12px] text-gold-dim hover:text-gold border-t border-edge">
            View all web orders →
          </button>
        </div>
      )}
    </div>
  );
}
