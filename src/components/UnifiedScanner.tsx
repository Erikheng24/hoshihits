"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { money } from "@/lib/format";
import { parseScan, type ItemKind, type ScanFields, type EnrichResult } from "@/lib/scan";
import type { QuickAddInput } from "@/app/(app)/inventory/enrich";

type EnrichFn = (kind: ItemKind, code: string, game?: string) => Promise<EnrichResult>;
type QuickAddFn = (input: QuickAddInput) => Promise<{ ok: boolean; error?: string; id?: number; sku?: string }>;

const TYPES: { kind: ItemKind; label: string; hint: string; icon: string }[] = [
  { kind: "raw", label: "Raw Card", hint: "Photograph the card — pulls art, set & market price", icon: "card" },
  { kind: "graded", label: "Graded Slab", hint: "Scan the cert QR — PSA / CGC / BGS", icon: "graded" },
  { kind: "sealed", label: "Booster Box / Pack", hint: "Scan the EAN / UPC barcode", icon: "inventory" },
];

export function UnifiedScanner({
  enrich,
  quickAdd,
  games,
  onClose,
}: {
  enrich: EnrichFn;
  quickAdd: QuickAddFn;
  games: string[];
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const busy = useRef(false);
  const router = useRouter();

  const [phase, setPhase] = useState<"type" | "camera" | "working" | "preview" | "done">("type");
  const [kind, setKind] = useState<ItemKind>("raw");
  const [game, setGame] = useState("Pokémon");
  const [camError, setCamError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState<EnrichResult["source"] | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);

  const [fields, setFields] = useState<ScanFields>({});
  const [image, setImage] = useState<string | null>(null);
  const [marketPrice, setMarketPrice] = useState<number | undefined>();

  const [manual, setManual] = useState("");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ sku: string } | null>(null);

  const usesCode = kind === "graded" || kind === "sealed";
  const guide = kind === "sealed" ? { w: 0.86, h: 0.5 } : { w: 0.66, h: 0.82 };

  const stopCamera = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  function cropToGuide(src: HTMLVideoElement | HTMLImageElement): string {
    const sw = "videoWidth" in src ? src.videoWidth : src.naturalWidth;
    const sh = "videoHeight" in src ? src.videoHeight : src.naturalHeight;
    const cw = sw * guide.w, ch = sh * guide.h;
    const cx = (sw - cw) / 2, cy = (sh - ch) / 2;
    const scale = Math.min(1, 760 / Math.max(cw, ch));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    canvas.getContext("2d")!.drawImage(src, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function applyResult(res: EnrichResult, fallbackImage: string | null) {
    setFields(res.fields);
    setImage(res.image ?? fallbackImage);
    setMarketPrice(res.marketPrice);
    setNote(res.message ?? null);
    setSource(res.source);
    if (res.marketPrice) setSell((res.marketPrice / 100).toFixed(2));
  }

  const runLookup = useCallback(
    async (code: string, fallbackImage: string | null) => {
      if (busy.current || !code) return;
      busy.current = true;
      setLastRead(code);
      setPhase("working");
      setStatus(kind === "graded" ? "Looking up cert on PSA…" : kind === "sealed" ? "Looking up product…" : "Matching card in catalog…");
      try {
        applyResult(await enrich(kind, code, game), fallbackImage);
      } catch {
        setNote("Lookup failed — fill the details in by hand.");
        setImage(fallbackImage);
      }
      stopCamera();
      setPhase("preview");
      busy.current = false;
    },
    [enrich, kind, game, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
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
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        const hints = new Map();
        hints.set(
          DecodeHintType.POSSIBLE_FORMATS,
          kind === "graded"
            ? [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]
            : [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]
        );
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        controlsRef.current = await reader.decodeFromVideoElement(video, (result) => {
          if (result && !busy.current) {
            const frame = videoRef.current && videoRef.current.readyState >= 2 ? cropToGuide(videoRef.current) : null;
            runLookup(result.getText(), frame);
          }
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCamError(
        /permission|denied|NotAllowed/i.test(msg)
          ? "Camera permission denied. Allow camera in your browser's site settings, then reopen."
          : "Camera unavailable — type the details below or upload a photo."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, usesCode, runLookup]);

  useEffect(() => {
    if (phase === "camera") startCamera();
    return stopCamera;
  }, [phase, startCamera, stopCamera]);

  async function runOcr(dataUrl: string): Promise<ScanFields> {
    setStatus("Reading the card…");
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(dataUrl, "eng", {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      return parseScan(data.text ?? "", kind === "sealed" ? "sealed" : kind === "graded" ? "graded" : "single");
    } catch {
      return {};
    }
  }

  /** Raw card: photo → OCR name → catalog lookup for art + price. */
  async function photoFlow(src: HTMLVideoElement | HTMLImageElement) {
    setPhase("working");
    const cropped = cropToGuide(src);
    setImage(cropped);
    const ocr = await runOcr(cropped);
    if (ocr.name) {
      await runLookup(ocr.name, cropped);
      return;
    }
    stopCamera();
    setFields(ocr);
    setSource("none");
    setNote("Couldn't read the card name — type it below to search the catalog.");
    setPhase("preview");
  }

  function handleCapture() {
    if (videoRef.current && videoRef.current.readyState >= 2) photoFlow(videoRef.current);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => photoFlow(img);
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  /** Custom photo override in the preview card. */
  function handleCustomPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => setImage(cropToGuide(img));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaveErr(null);
    setSaving(true);
    const res = await quickAdd({
      kind,
      name: fields.name ?? "",
      game,
      set_name: fields.set_name,
      rarity: fields.rarity,
      condition: fields.condition,
      grade_company: fields.grade_company,
      grade: fields.grade,
      cert_number: fields.cert_number,
      barcode: fields.barcode,
      image: image ?? undefined,
      marketPrice,
      costCents: Math.round((parseFloat(cost) || 0) * 100),
      priceCents: Math.round((parseFloat(sell) || 0) * 100),
      qty: parseInt(qty || "0", 10),
      notes,
    });
    setSaving(false);
    if (!res.ok) { setSaveErr(res.error ?? "Save failed."); return; }
    setSaved({ sku: res.sku! });
    setPhase("done");
    router.refresh();
  }

  function reset() {
    setPhase("type");
    setFields({}); setImage(null); setMarketPrice(undefined);
    setNote(null); setSource(null); setLastRead(null);
    setManual(""); setCost(""); setSell(""); setQty("1"); setNotes("");
    setSaveErr(null); setSaved(null); setProgress(0);
  }

  const typeLabel = TYPES.find((t) => t.kind === kind)!.label;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 animate-fadein" onClick={onClose} />
      <div className="relative card shadow-pop w-full max-w-lg p-5 animate-rise max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg tracking-wide text-white flex items-center gap-2">
            <Icon name="scan" className="w-5 h-5 text-gold" />
            {phase === "type" ? "Scan to add" : phase === "done" ? "Added" : typeLabel}
          </h3>
          <button onClick={onClose} className="text-fog hover:text-white"><Icon name="x" className="w-5 h-5" /></button>
        </div>

        {/* ---- 1. Item type ---- */}
        {phase === "type" && (
          <>
            <p className="text-[12px] text-fog mb-3">What are you adding?</p>
            <div className="space-y-2">
              {TYPES.map((t) => (
                <button
                  key={t.kind}
                  onClick={() => { setKind(t.kind); setPhase("camera"); }}
                  className="w-full rounded-xl border border-edge hover:border-gold/40 bg-panel-2 hover:bg-gold/[0.06] transition-colors p-4 flex items-center gap-4 text-left"
                >
                  <span className="w-11 h-11 rounded-lg bg-gold/10 border border-gold/25 text-gold flex items-center justify-center shrink-0">
                    <Icon name={t.icon} className="w-5 h-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-white font-medium">{t.label}</span>
                    <span className="block text-[12px] text-fog">{t.hint}</span>
                  </span>
                  <Icon name="chevronRight" className="w-4 h-4 text-fog" />
                </button>
              ))}
            </div>
            <label className="field mt-4 block">
              <span>Game / line</span>
              <select className="input" value={game} onChange={(e) => setGame(e.target.value)}>
                {games.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
          </>
        )}

        {/* ---- 2. Scan ---- */}
        {phase === "camera" && (
          <>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4] sm:aspect-[4/3]">
              <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="border-2 border-gold/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                     style={{ width: `${guide.w * 100}%`, height: `${guide.h * 100}%` }} />
              </div>
              {usesCode && !camError && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 badge bg-black/70 text-gold-soft border border-gold/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                  Scanning {kind === "graded" ? "QR code" : "barcode"}…
                </div>
              )}
              {camError && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                  <p className="text-mist text-sm">{camError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && manual.trim() && runLookup(manual.trim(), null)}
                className="input"
                placeholder={kind === "graded" ? "…or type cert number" : kind === "sealed" ? "…or type barcode" : "…or type the card name"}
              />
              <button onClick={() => manual.trim() && runLookup(manual.trim(), null)} disabled={!manual.trim()}
                      className="btn-gold px-4 text-sm shrink-0 disabled:opacity-40">
                {kind === "raw" ? "Search" : "Look up"}
              </button>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => setPhase("type")} className="btn-ghost px-3 py-2.5 text-sm">← Back</button>
              <label className="btn-ghost px-4 py-2.5 text-sm cursor-pointer flex-1 justify-center">
                <Icon name="export" className="w-4 h-4" /> Upload photo
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
              </label>
              <button onClick={handleCapture} disabled={!!camError}
                      className={`${kind === "raw" ? "btn-gold" : "btn-ghost"} px-4 py-2.5 text-sm flex-1 justify-center disabled:opacity-40`}>
                <Icon name="scan" className="w-4 h-4" /> {kind === "raw" ? "Capture" : "Photo"}
              </button>
            </div>
          </>
        )}

        {/* ---- 3. Working ---- */}
        {phase === "working" && (
          <div className="py-10 text-center">
            {image && <img src={image} alt="" className="mx-auto max-h-44 rounded-lg border border-edge mb-5" />}
            {lastRead && (
              <p className="text-[11px] text-jade mb-3 num flex items-center justify-center gap-1.5">
                <Icon name="check" className="w-3.5 h-3.5" /> Read: {lastRead.slice(0, 50)}
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

        {/* ---- 4. Preview card + inputs ---- */}
        {phase === "preview" && (
          <>
            <div className="rounded-xl border border-edge bg-panel-2 p-4 mb-4">
              <div className="flex gap-4">
                <div className="shrink-0">
                  {image ? (
                    <img src={image} alt="" className="w-24 h-32 object-cover rounded-lg border border-edge" />
                  ) : (
                    <div className="w-24 h-32 rounded-lg border border-edge bg-panel flex items-center justify-center text-fog">
                      <Icon name="card" className="w-6 h-6" />
                    </div>
                  )}
                  <label className="btn-ghost w-full mt-2 px-2 py-1.5 text-[11px] cursor-pointer justify-center">
                    <Icon name="export" className="w-3 h-3" /> Photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCustomPhoto} />
                  </label>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <span className="badge bg-gold/12 text-gold-soft border border-gold/30">{typeLabel}</span>
                  <input
                    className="input !py-1.5 font-medium"
                    value={fields.name ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Card / product title"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className="input !py-1.5 text-[12px]" value={fields.set_name ?? ""} placeholder="Set"
                           onChange={(e) => setFields((f) => ({ ...f, set_name: e.target.value }))} />
                    <input className="input !py-1.5 text-[12px] num" value={fields.rarity ?? ""} placeholder="Card #"
                           onChange={(e) => setFields((f) => ({ ...f, rarity: e.target.value }))} />
                  </div>
                  {kind === "graded" && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <input className="input !py-1.5 text-[12px] num" value={fields.cert_number ?? ""} placeholder="Cert #"
                             onChange={(e) => setFields((f) => ({ ...f, cert_number: e.target.value }))} />
                      <input className="input !py-1.5 text-[12px] num" value={fields.grade ?? ""} placeholder="Grade"
                             onChange={(e) => setFields((f) => ({ ...f, grade: e.target.value }))} />
                    </div>
                  )}
                  {kind === "sealed" && (
                    <input className="input !py-1.5 text-[12px] num" value={fields.barcode ?? ""} placeholder="Barcode"
                           onChange={(e) => setFields((f) => ({ ...f, barcode: e.target.value }))} />
                  )}
                  {marketPrice ? (
                    <p className="text-[12px] text-jade num pt-0.5">Market est. {money(marketPrice)}</p>
                  ) : (
                    <p className="text-[12px] text-fog pt-0.5">No market estimate</p>
                  )}
                </div>
              </div>
            </div>

            {source && source !== "none" && (
              <p className="text-[11px] uppercase tracking-[0.16em] text-jade mb-2 flex items-center gap-1.5">
                <Icon name="check" className="w-3.5 h-3.5" />
                {source === "psa" ? "Pulled from PSA" : source === "demo" ? "Demo lookup" : "Catalog match"}
              </p>
            )}
            {note && <p className="text-[12px] text-amberish mb-3">{note}</p>}

            <div className="grid grid-cols-3 gap-2 mb-3">
              <label className="field"><span>Cost ($)</span>
                <input className="input num" type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
              </label>
              <label className="field"><span>Sell ($)</span>
                <input className="input num" type="number" step="0.01" min="0" value={sell} onChange={(e) => setSell(e.target.value)} />
              </label>
              <label className="field"><span>Qty</span>
                <input className="input num" type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
            </div>
            <label className="field mb-3 block"><span>Notes</span>
              <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition remarks, storage location…" />
            </label>

            {saveErr && <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 mb-3">{saveErr}</p>}

            <div className="flex items-center gap-2">
              <button onClick={() => setPhase("camera")} className="btn-ghost px-4 py-2.5 text-sm flex-1 justify-center">
                <Icon name="scan" className="w-4 h-4" /> Rescan
              </button>
              <button onClick={save} disabled={saving || !(fields.name ?? "").trim()}
                      className="btn-gold px-5 py-2.5 text-sm flex-1 justify-center disabled:opacity-50">
                <Icon name="check" className="w-4 h-4" /> {saving ? "Saving…" : "Save to inventory"}
              </button>
            </div>
          </>
        )}

        {/* ---- 5. Done ---- */}
        {phase === "done" && saved && (
          <div className="py-10 text-center">
            <span className="inline-flex w-14 h-14 rounded-full bg-jade/10 border border-jade/30 text-jade items-center justify-center mb-4">
              <Icon name="check" className="w-6 h-6" />
            </span>
            <p className="text-white text-lg">{fields.name}</p>
            <p className="text-fog num mt-1">Added as {saved.sku}</p>
            <div className="flex items-center justify-center gap-2 mt-6">
              <button onClick={onClose} className="btn-ghost px-4 py-2.5 text-sm">Done</button>
              <button onClick={reset} className="btn-gold px-5 py-2.5 text-sm">
                <Icon name="plus" className="w-4 h-4" /> Scan another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
