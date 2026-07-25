"use client";

import { useEffect, useRef, useState } from "react";

interface State {
  idle: boolean;
  paymentId?: number;
  image?: string;
  amount?: number;
  ref?: string;
  status?: string;
  expiresAt?: number;
}

const money = (cents = 0) => `$${(cents / 100).toFixed(2)}`;

/**
 * Polls /api/khqr/current about once a second. Three screens: idle welcome,
 * live QR to scan, and a paid confirmation that clears itself.
 */
export function DisplayScreen({ name, logo, configured }: { name: string; logo: string | null; configured: boolean }) {
  const [state, setState] = useState<State>({ idle: true });
  const [clock, setClock] = useState(() => Date.now());
  const paidSince = useRef<number | null>(null);

  // 1-second tick so the "valid for m:ss" countdown updates.
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch("/api/khqr/current", { cache: "no-store" });
        const data = (await res.json()) as State;
        if (!alive) return;
        // Hold the "paid" screen for a few seconds, then fall back to idle.
        if (data.status === "paid") {
          if (paidSince.current === null) paidSince.current = Date.now();
          if (Date.now() - paidSince.current > 6000) {
            setState({ idle: true });
          } else {
            setState(data);
          }
        } else {
          paidSince.current = null;
          setState(data);
        }
      } catch {
        /* keep the last screen on a transient network hiccup */
      } finally {
        if (alive) timer = setTimeout(tick, 1100);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const paid = state.status === "paid";
  const showQr = !state.idle && state.status === "pending" && state.image;

  return (
    <div className="min-h-screen bg-ink text-white flex flex-col items-center justify-center px-6 py-10 text-center select-none">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-8">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="w-11 h-11 rounded-xl object-cover" />
        ) : (
          <span className="w-11 h-11 rounded-xl bg-gold/15 border border-gold/40 grid place-items-center text-gold text-xl">★</span>
        )}
        <span className="font-display tracking-[0.14em] text-gold-grad text-2xl">{name.toUpperCase()}</span>
      </div>

      {paid ? (
        <div className="animate-rise flex flex-col items-center">
          <div className="w-28 h-28 rounded-full bg-jade/15 border-2 border-jade grid place-items-center mb-6">
            <svg viewBox="0 0 24 24" className="w-16 h-16 text-jade" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="text-3xl font-semibold text-jade">Payment received</p>
          <p className="text-lg text-mist mt-2">អរគុណ · Thank you!</p>
          {state.amount != null && <p className="num text-2xl text-white mt-4">{money(state.amount)}</p>}
        </div>
      ) : showQr ? (
        <div className="animate-rise flex flex-col items-center">
          <p className="text-mist text-lg mb-1">Total to pay</p>
          <p className="num text-5xl font-bold text-gold-soft mb-5">{money(state.amount)}</p>
          <div className="bg-white p-4 rounded-2xl shadow-pop">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.image} alt="KHQR" className="w-64 h-64 sm:w-72 sm:h-72" />
          </div>
          <p className="text-white text-lg mt-6 font-medium">Scan to pay with any bank app</p>
          <p className="text-fog text-sm mt-1">ABA · ACLEDA · Wing · Bakong · and more (KHQR)</p>
          {state.expiresAt && (() => {
            const left = Math.max(0, Math.round((state.expiresAt - clock) / 1000));
            const mm = Math.floor(left / 60);
            const ss = String(left % 60).padStart(2, "0");
            return <p className={`num text-sm mt-3 ${left <= 30 ? "text-ruby" : "text-fog"}`}>{left > 0 ? `Valid for ${mm}:${ss}` : "Expired"}</p>;
          })()}
          {state.ref && <p className="text-fog text-xs mt-1 num">Ref {state.ref}</p>}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-2xl border border-edge grid place-items-center mb-6">
            <svg viewBox="0 0 24 24" className="w-12 h-12 text-fog" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 20h.01M20 14h.01M14 20h.01" />
            </svg>
          </div>
          <p className="text-2xl text-mist">Ready</p>
          <p className="text-fog mt-2">{configured ? "Your QR will appear here at checkout." : "KHQR is not set up yet — add your Bakong details in Settings."}</p>
        </div>
      )}
    </div>
  );
}
