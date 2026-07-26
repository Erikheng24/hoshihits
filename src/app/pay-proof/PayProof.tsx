"use client";

import { useEffect, useRef, useState } from "react";
import { fileToDataUrl } from "@/lib/image-client";

/**
 * The "Submit payment photo" mini screen, opened as a Telegram Web App from the
 * bot. One job: pick a payment screenshot and send it to the shop. No chatting.
 */
export function PayProof({ order }: { order: string }) {
  const [img, setImg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Telegram Web App niceties (expand, dark theme) — harmless if not in Telegram.
    const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void; close: () => void } } }).Telegram?.WebApp;
    try { tg?.ready(); tg?.expand(); } catch { /* not in Telegram */ }
  }, []);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      setImg(await fileToDataUrl(file, 1400, 0.85));
    } catch {
      setErr("Couldn't read that image — try another.");
    } finally {
      e.target.value = "";
    }
  }

  async function send() {
    if (!img) { setErr("Please choose your payment photo first."); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/pay-proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order, image: img }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) { setErr(data.error ?? "Couldn't send. Please try again."); return; }
      setDone(true);
      const tg = (window as unknown as { Telegram?: { WebApp?: { close: () => void } } }).Telegram?.WebApp;
      setTimeout(() => { try { tg?.close(); } catch { /* ignore */ } }, 2200);
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-ink text-white flex items-center justify-center p-6 text-center">
        <div className="card p-8 max-w-sm w-full">
          <div className="w-16 h-16 rounded-full badge-foil grid place-items-center mx-auto mb-4 pop-in">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-gold" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="text-xl font-display tracking-wide">Sent!</p>
          <p className="text-mist text-sm mt-2">We&apos;ve received your payment photo and will confirm your order shortly. Thank you! 🙏</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-white flex items-center justify-center p-5">
      <div className="card w-full max-w-sm p-6">
        <p className="text-[11px] uppercase tracking-[0.3em] text-gold-dim text-center">Order {order}</p>
        <h1 className="font-display text-xl tracking-[0.06em] text-center mt-1 mb-1">Payment Photo</h1>
        <p className="text-fog text-[12px] text-center mb-5">Send us a screenshot of your payment so we can confirm your order.</p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-edge-2 bg-panel-2 grid place-items-center overflow-hidden hover:border-gold/40 transition-colors"
        >
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-center px-4">
              <span className="block text-4xl mb-2">📸</span>
              <span className="block text-mist text-sm">Tap to choose your payment screenshot</span>
            </span>
          )}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />

        {img && <button type="button" onClick={() => inputRef.current?.click()} className="text-[12px] text-gold-dim hover:text-gold mt-2">Choose a different photo</button>}
        {err && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 mt-3">{err}</p>}

        <button onClick={send} disabled={busy || !img} className="btn-gold w-full py-3.5 mt-4 justify-center disabled:opacity-50">
          {busy ? "Sending…" : "Send to shop"}
        </button>
      </div>
    </div>
  );
}
