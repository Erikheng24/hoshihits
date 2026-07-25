"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { Portal } from "./Portal";
import { AiBattery, type AiUsageLike } from "./AiBattery";
import { type ScanMode, type ScanFields, type EnrichResult } from "@/lib/scan";
import type { PhotoIdResult } from "@/app/(app)/inventory/enrich";

type IdentifyFn = (dataUrl: string, gameHint?: string) => Promise<PhotoIdResult>;

/**
 * Add-Product scanner — one AI reads everything from a photo:
 * - card:   name / set / number / rarity
 * - graded: name / set / grade / cert number (read off the slab label)
 * - box:    name / set
 * The photo you take is the product picture. No PSA / barcode lookups.
 */
export function ScanCapture({
  mode,
  identify,
  initialUsage,
  onApply,
  onClose,
}: {
  mode: ScanMode;
  identify: IdentifyFn;
  initialUsage?: AiUsageLike;
  onApply: (fields: ScanFields, image: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<"camera" | "working" | "review">("camera");
  const [camError, setCamError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState<EnrichResult["source"] | null>(null);
  const [fields, setFields] = useState<ScanFields>({});
  const [usage, setUsage] = useState(initialUsage ?? null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Capture the WHOLE frame (no crop) so vertical or horizontal boxes both fit.
  function cropToGuide(src: HTMLVideoElement | HTMLImageElement): string {
    const sw = "videoWidth" in src ? src.videoWidth : src.naturalWidth;
    const sh = "videoHeight" in src ? src.videoHeight : src.naturalHeight;
    const scale = Math.min(1, 1024 / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCamError(
        /permission|denied|NotAllowed/i.test(msg)
          ? "Camera permission was denied. Tap the address bar → site settings → allow Camera, then try again."
          : "Camera unavailable. Upload a photo instead."
      );
    }
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  /** Photograph the item → AI vision fills the fields (any language). */
  async function photoIdentify(src: HTMLVideoElement | HTMLImageElement) {
    setPhase("working");
    const cropped = cropToGuide(src);
    setImage(cropped);
    setStatus("Identifying with AI…");
    try {
      const r = await identify(cropped);
      if (r.usage) setUsage(r.usage);
      setFields(r.fields);
      setImage(r.image ?? cropped);
      setSource(r.identified ? r.source : "none");
      if (!r.identified) setNote(r.message ?? "Couldn't identify that photo — fill the fields in by hand.");
      else if (r.message) setNote(r.message);
    } catch {
      setNote("Identification failed — the photo is saved; fill the fields in by hand.");
    }
    stopCamera();
    setPhase("review");
  }

  function handleCapture() {
    if (videoRef.current && videoRef.current.readyState >= 2) photoIdentify(videoRef.current);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => photoIdentify(img);
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function retake() {
    setImage(null);
    setFields({});
    setNote(null);
    setSource(null);
    setPhase("camera");
    startCamera();
  }

  const foundEntries = Object.entries(fields).filter(([, v]) => v);
  const LABELS: Record<string, string> = {
    name: "Name", set_name: "Set", rarity: "Rarity / #", condition: "Condition",
    grade_company: "Grader", grade: "Grade", cert_number: "Cert #", barcode: "Barcode",
  };
  const title = mode === "sealed" ? "Photograph box" : mode === "graded" ? "Photograph slab" : "Photograph card";

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

        {usage && <AiBattery usage={usage} className="-mt-2 mb-3" />}

        {phase === "camera" && (
          <>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4] sm:aspect-[4/3]">
              <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-contain" />
              {camError && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                  <p className="text-mist text-sm">{camError}</p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-fog mt-3 text-center leading-relaxed">
              Get the whole {mode === "sealed" ? "box" : mode === "graded" ? "slab" : "card"} in the frame, straight-on and well-lit, then Capture.
            </p>

            <div className="flex items-center gap-2 mt-3">
              <label className="btn-ghost px-4 py-2.5 text-sm cursor-pointer flex-1 justify-center">
                <Icon name="export" className="w-4 h-4" /> Upload photo
                {/* No `capture` — lets the phone offer both the photo library and the camera. */}
                <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>
              <button onClick={handleCapture} disabled={!!camError} className="btn-gold px-5 py-2.5 text-sm flex-1 justify-center disabled:opacity-40">
                <Icon name="scan" className="w-4 h-4" /> Capture
              </button>
            </div>
          </>
        )}

        {phase === "working" && (
          <div className="py-10 text-center">
            {image && <img src={image} alt="" className="mx-auto max-h-48 rounded-lg border border-edge mb-5" />}
            <div className="inline-flex items-center gap-2 text-mist text-sm">
              <span className="w-4 h-4 rounded-full border-2 border-gold/40 border-t-gold animate-spin" />
              {status || "Processing…"}
            </div>
          </div>
        )}

        {phase === "review" && (
          <>
            {image && <img src={image} alt="" className="mx-auto max-h-56 rounded-lg border border-edge mb-4" />}
            {source && source !== "none" && (
              <p className="text-[11px] uppercase tracking-[0.16em] text-jade mb-2 flex items-center gap-1.5">
                <Icon name="check" className="w-3.5 h-3.5" /> Matched in catalog
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
              <p className="text-mist text-sm text-center mb-4">No data detected — the photo is saved; fill fields in by hand.</p>
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
