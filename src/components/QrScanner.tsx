"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

/**
 * Live camera scanner for slab QR codes / barcodes. Calls onResult with the raw
 * decoded text (the caller extracts the cert number). Rear camera by default.
 */
export function QrScanner({ onResult, onClose, title = "Scan slab QR / barcode" }: {
  onResult: (text: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | null = null;
    let done = false;
    reader
      .decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result, _e, c) => {
        controls = c;
        if (result && !done) {
          done = true;
          try { c.stop(); } catch { /* ignore */ }
          onResult(result.getText());
        }
      })
      .then((c) => { controls = c; })
      .catch(() => setErr("Couldn't open the camera. Allow camera access in your browser, and make sure you're on the https:// site."));
    return () => { try { controls?.stop(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 animate-fadein" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-panel border border-edge shadow-pop animate-rise">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <div className="flex items-center gap-2 text-white">
            <span className="w-7 h-7 rounded-lg bg-gold/15 text-gold grid place-items-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>
            </span>
            <span className="text-sm font-medium">{title}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-fog hover:text-white hover:bg-white/5 grid place-items-center text-xl leading-none">×</button>
        </div>

        {err ? (
          <div className="p-5">
            <p className="text-ruby text-[13px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-3">{err}</p>
            <button onClick={onClose} className="btn-ghost w-full py-2.5 mt-3 text-sm justify-center">Close</button>
          </div>
        ) : (
          <>
            <div className="relative bg-black aspect-square">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline />
              {/* aiming box with corner brackets + sweeping line */}
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="relative w-2/3 h-2/3">
                  {[
                    "top-0 left-0 border-t-2 border-l-2 rounded-tl-lg",
                    "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg",
                    "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg",
                    "bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg",
                  ].map((c, i) => (
                    <span key={i} className={`absolute w-7 h-7 border-gold ${c}`} />
                  ))}
                  <span className="scanline absolute left-1 right-1 h-0.5 bg-gold/80 shadow-[0_0_10px_2px_rgba(212,175,55,0.6)] rounded-full" />
                </div>
              </div>
            </div>
            <p className="text-[12px] text-fog text-center px-4 py-3">Hold the slab&apos;s <b className="text-mist">QR code</b> inside the box — it scans automatically.</p>
          </>
        )}
      </div>
    </div>
  );
}
