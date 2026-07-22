"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { Portal } from "./Portal";
import { parseScan, type ScanMode, type ScanFields, type EnrichResult } from "@/lib/scan";

type EnrichFn = (kind: "graded" | "sealed", code: string) => Promise<EnrichResult>;

/**
 * Add-Product scanner.
 * - graded: reads the slab QR → look up PSA → auto-fill name / cert / grade + photo.
 * - sealed: reads the box barcode → look up product → auto-fill name + photo.
 * - single: photograph the card → OCR fills name / number / rarity.
 * Cross-platform code reader via @zxing/browser (works on iOS Safari, unlike the
 * browser's native BarcodeDetector which is Android-Chrome-only).
 */
export function ScanCapture({
  mode,
  enrich,
  onApply,
  onClose,
}: {
  mode: ScanMode;
  enrich: EnrichFn;
  onApply: (fields: ScanFields, image: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const busy = useRef(false);

  const usesCode = mode === "graded" || mode === "sealed";
  const codeKind = mode === "graded" ? "graded" : "sealed";

  const [phase, setPhase] = useState<"camera" | "working" | "review">("camera");
  const [camError, setCamError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState<EnrichResult["source"] | null>(null);
  const [fields, setFields] = useState<ScanFields>({});
  const [manual, setManual] = useState("");
  const [scanTicks, setScanTicks] = useState(0); // live "scanning…" counter for user feedback
  const [lastRead, setLastRead] = useState<string | null>(null);

  const guide = mode === "sealed" ? { w: 0.86, h: 0.5 } : { w: 0.66, h: 0.82 };

  const stopCamera = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  function cropToGuide(source: HTMLVideoElement | HTMLImageElement): string {
    const sw = "videoWidth" in source ? source.videoWidth : source.naturalWidth;
    const sh = "videoHeight" in source ? source.videoHeight : source.naturalHeight;
    const cropW = sw * guide.w, cropH = sh * guide.h;
    const cropX = (sw - cropW) / 2, cropY = (sh - cropH) / 2;
    const scale = Math.min(1, 760 / Math.max(cropW, cropH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropW * scale);
    canvas.height = Math.round(cropH * scale);
    canvas.getContext("2d")!.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  const lookupCode = useCallback(
    async (code: string) => {
      if (busy.current || !code) return;
      busy.current = true;
      setLastRead(code);
      const frame = videoRef.current && videoRef.current.readyState >= 2 ? cropToGuide(videoRef.current) : null;
      setPhase("working");
      setStatus(mode === "graded" ? "Looking up cert on PSA…" : "Looking up product…");
      try {
        const res = await enrich(codeKind, code);
        setFields(res.fields);
        setImage(res.image ?? frame);
        setNote(res.message ?? null);
        setSource(res.source);
      } catch {
        setNote("Lookup failed — you can fill the fields in by hand.");
        setImage(frame);
      }
      stopCamera();
      setPhase("review");
      busy.current = false;
    },
    [enrich, codeKind, mode, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setCamError(null);
    setScanTicks(0);
    try {
      // Grab camera stream ourselves so we can bind it to the video AND to zxing.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      if (usesCode) {
        // Lazy import so the ~200KB library only loads when actually scanning codes.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        const hints = new Map();
        hints.set(
          DecodeHintType.POSSIBLE_FORMATS,
          mode === "graded"
            ? [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]
            : [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]
        );
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        controlsRef.current = await reader.decodeFromVideoElement(video, (result) => {
          setScanTicks((n) => n + 1);
          if (result && !busy.current) {
            lookupCode(result.getText());
          }
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCamError(
        /permission|denied|NotAllowed/i.test(msg)
          ? "Camera permission was denied. Tap the address bar → site settings → allow Camera, then try again."
          : usesCode
          ? "Camera unavailable. Type the code below, or upload a photo."
          : "Camera unavailable. Upload a photo instead."
      );
    }
  }, [mode, usesCode, lookupCode]);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  async function runOcr(dataUrl: string): Promise<ScanFields> {
    setStatus("Reading text…");
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(dataUrl, "eng", {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      return parseScan(data.text ?? "", mode);
    } catch {
      setNote("Text reading unavailable offline — photo saved; fill fields manually.");
      return {};
    }
  }

  async function photoOcr(source: HTMLVideoElement | HTMLImageElement) {
    setPhase("working");
    const cropped = cropToGuide(source);
    setImage(cropped);
    const ocr = await runOcr(cropped);
    stopCamera();
    setFields(ocr);
    setSource("none");
    setPhase("review");
  }

  function handleCapture() {
    if (videoRef.current && videoRef.current.readyState >= 2) photoOcr(videoRef.current);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // If we're in code-mode, try to read a code out of the still first; else OCR.
        if (usesCode) tryDecodeStill(img).then((code) => (code ? lookupCode(code) : photoOcr(img)));
        else photoOcr(img);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function tryDecodeStill(img: HTMLImageElement): Promise<string | null> {
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const result = await reader.decodeFromCanvas(canvas);
      return result.getText();
    } catch {
      return null;
    }
  }

  function retake() {
    setImage(null);
    setFields({});
    setNote(null);
    setSource(null);
    setProgress(0);
    setManual("");
    setLastRead(null);
    setPhase("camera");
    startCamera();
  }

  const foundEntries = Object.entries(fields).filter(([, v]) => v);
  const LABELS: Record<string, string> = {
    name: "Name", set_name: "Set", rarity: "Rarity / #", condition: "Condition",
    grade_company: "Grader", grade: "Grade", cert_number: "Cert #", barcode: "Barcode",
  };
  const title = mode === "sealed" ? "Scan box barcode" : mode === "graded" ? "Scan slab QR code" : "Scan card";

  return (
    <Portal>
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-black/85 animate-fadein" onClick={onClose} />
      <div className="relative card shadow-pop w-full max-w-lg p-5 animate-rise my-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg tracking-wide text-white flex items-center gap-2">
            <Icon name="scan" className="w-5 h-5 text-gold" /> {title}
          </h3>
          <button onClick={onClose} className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></button>
        </div>

        {phase === "camera" && (
          <>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4] sm:aspect-[4/3]">
              <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className="border-2 border-gold/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                  style={{ width: `${guide.w * 100}%`, height: `${guide.h * 100}%` }}
                />
              </div>
              {usesCode && !camError && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 badge bg-black/70 text-gold-soft border border-gold/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                  {scanTicks < 3 ? "Starting camera…" : `Scanning ${mode === "graded" ? "QR code" : "barcode"}…`}
                </div>
              )}
              {camError && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                  <p className="text-mist text-sm">{camError}</p>
                </div>
              )}
            </div>

            {usesCode && (
              <>
                <p className="text-[11px] text-fog mt-3 text-center leading-relaxed">
                  {mode === "graded"
                    ? "Point the camera at the QR code on the slab label. Hold steady 15–25 cm away."
                    : "Point at the box barcode. Fill the frame with the black bars."}
                </p>
                <div className="flex gap-2 mt-3">
                  <input
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && manual.trim() && lookupCode(manual.trim())}
                    className="input num"
                    placeholder={mode === "graded" ? "…or type cert number" : "…or type barcode number"}
                    inputMode="numeric"
                  />
                  <button onClick={() => manual.trim() && lookupCode(manual.trim())} disabled={!manual.trim()} className="btn-gold px-4 text-sm shrink-0 disabled:opacity-40">
                    Look up
                  </button>
                </div>
              </>
            )}

            <div className="flex items-center gap-2 mt-3">
              <label className="btn-ghost px-4 py-2.5 text-sm cursor-pointer flex-1 justify-center">
                <Icon name="export" className="w-4 h-4" /> Upload photo
                {/* No `capture` — lets the phone offer both the photo library and the camera. */}
                <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>
              {!usesCode ? (
                <button onClick={handleCapture} disabled={!!camError} className="btn-gold px-5 py-2.5 text-sm flex-1 justify-center disabled:opacity-40">
                  <Icon name="scan" className="w-4 h-4" /> Capture
                </button>
              ) : (
                <button onClick={handleCapture} disabled={!!camError} className="btn-ghost px-4 py-2.5 text-sm flex-1 justify-center disabled:opacity-40" title="Save a photo instead of scanning a code">
                  Photo only
                </button>
              )}
            </div>
          </>
        )}

        {phase === "working" && (
          <div className="py-10 text-center">
            {image && <img src={image} alt="" className="mx-auto max-h-48 rounded-lg border border-edge mb-5" />}
            {lastRead && (
              <p className="text-[11px] text-jade mb-3 num flex items-center justify-center gap-1.5">
                <Icon name="check" className="w-3.5 h-3.5" /> Code read: {lastRead.slice(0, 60)}
              </p>
            )}
            <div className="inline-flex items-center gap-2 text-mist text-sm">
              <span className="w-4 h-4 rounded-full border-2 border-gold/40 border-t-gold animate-spin" />
              {status || "Processing…"}
            </div>
            {progress > 0 && (
              <div className="h-1.5 rounded-full bg-edge overflow-hidden mt-4 max-w-xs mx-auto">
                <div className="h-full bg-gold/70 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {phase === "review" && (
          <>
            {image && <img src={image} alt="" className="mx-auto max-h-56 rounded-lg border border-edge mb-4" />}
            {lastRead && (
              <p className="text-[11px] text-jade mb-2 num flex items-center gap-1.5">
                <Icon name="check" className="w-3.5 h-3.5" /> Code read: {lastRead.slice(0, 60)}
              </p>
            )}
            {source && source !== "none" && (
              <p className="text-[11px] uppercase tracking-[0.16em] text-jade mb-2 flex items-center gap-1.5">
                <Icon name="check" className="w-3.5 h-3.5" />
                {source === "psa" ? "Pulled from PSA" : source === "upc" ? "Product matched" : "Demo lookup"}
              </p>
            )}
            {foundEntries.length > 0 ? (
              <>
                <p className="text-[11px] uppercase tracking-[0.16em] text-fog mb-2">Detected — confirm before saving</p>
                <div className="space-y-1.5 mb-4">
                  {foundEntries.map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm border-b border-edge/60 pb-1.5">
                      <span className="text-fog">{LABELS[k] ?? k}</span>
                      <span className="text-white num text-right">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-mist text-sm text-center mb-4">
                {lastRead
                  ? "Code was read but no product data came back. The cert/barcode is saved — fill the rest in by hand."
                  : "No data detected — the photo is saved; fill fields in by hand."}
              </p>
            )}
            {note && <p className="text-[12px] text-amberish mb-3">{note}</p>}
            <div className="flex items-center gap-2">
              <button onClick={retake} className="btn-ghost px-4 py-2.5 text-sm flex-1 justify-center">
                <Icon name="scan" className="w-4 h-4" /> Rescan
              </button>
              <button onClick={() => onApply(fields, image ?? "")} className="btn-gold px-5 py-2.5 text-sm flex-1 justify-center">
                <Icon name="check" className="w-4 h-4" /> Use this
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}
