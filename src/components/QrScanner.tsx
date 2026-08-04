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
      .catch(() => setErr("Couldn't open the camera. Allow camera access, and make sure you're on https:// (your live site is)."));
    return () => { try { controls?.stop(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 animate-fadein" onClick={onClose} />
      <div className="relative card shadow-pop w-full max-w-md p-4 animate-rise">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base tracking-wide text-white">{title}</h2>
          <button onClick={onClose} className="text-fog hover:text-white text-2xl leading-none">×</button>
        </div>
        {err ? (
          <p className="text-ruby text-[13px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-3">{err}</p>
        ) : (
          <>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
              {/* aiming frame */}
              <div className="absolute inset-0 pointer-events-none grid place-items-center">
                <div className="w-3/5 h-3/5 border-2 border-gold/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <p className="text-[12px] text-fog text-center mt-3">Point the camera at the slab&apos;s QR code (or a barcode). It reads automatically.</p>
          </>
        )}
      </div>
    </div>
  );
}
