"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/**
 * Receipt actions: Save image, PDF, Print.
 *
 * Cheap Bluetooth thermal printers (57/58mm) can't be driven by window.print()
 * — they print via their own companion app, which takes an IMAGE. And iOS
 * ignores window.print() entirely in a home-screen PWA. So the primary action
 * is "Save image": on a phone it opens the native share sheet ("Save Image" →
 * Photos, or send straight to the printer app); on a computer it downloads a PNG.
 */

const THERMAL_MM = 58; // matches common 57/58mm mini printers

async function renderReceiptCanvas(): Promise<HTMLCanvasElement> {
  const node = document.querySelector<HTMLElement>(".print-receipt");
  if (!node) throw new Error("Receipt not found on the page.");
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(node, {
    backgroundColor: "#ffffff",
    scale: 3, // thermal printers are 1-bit — render crisp, high-contrast
    useCORS: true,
    onclone: (doc) => {
      const el = doc.querySelector<HTMLElement>(".print-receipt");
      if (!el) return;
      // Consistent 58mm-ish column with tight margins, black on white.
      el.style.width = "360px";
      el.style.maxWidth = "360px";
      el.style.padding = "16px";
      el.style.background = "#ffffff";
      el.style.border = "0";
      el.style.boxShadow = "none";
      el.querySelectorAll<HTMLElement>("*").forEach((n) => {
        n.style.color = "#000000";
        n.style.background = "transparent";
        (n.style as any).webkitTextFillColor = "#000000";
        n.style.borderColor = "#999999";
        n.style.textShadow = "none";
      });
    },
  });
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReceiptActions({ fileName, auto = false }: { fileName: string; auto?: boolean }) {
  const [busy, setBusy] = useState<null | "image" | "pdf">(null);
  const [err, setErr] = useState<string | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(auto ? "Saving receipt and opening the printer…" : null);
  const autoRan = useRef(false);

  async function saveImage() {
    setErr(null);
    setBusy("image");
    try {
      const canvas = await renderReceiptCanvas();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Could not render the image.");
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });

      // Phones: native share sheet → "Save Image" (Photos) or send to the printer app.
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: fileName });
          return;
        } catch (e) {
          if ((e as { name?: string })?.name === "AbortError") return; // user cancelled
          // otherwise fall through to a plain download
        }
      }
      downloadBlob(blob, `${fileName}.png`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the image.");
    } finally {
      setBusy(null);
    }
  }

  async function savePdf() {
    setErr(null);
    setBusy("pdf");
    try {
      const canvas = await renderReceiptCanvas();
      const { jsPDF } = await import("jspdf");
      const heightMm = (canvas.height / canvas.width) * THERMAL_MM;
      const pdf = new jsPDF({ unit: "mm", format: [THERMAL_MM, heightMm] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, THERMAL_MM, heightMm);
      pdf.save(`${fileName}.pdf`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the PDF.");
    } finally {
      setBusy(null);
    }
  }

  // Auto mode (after a KHQR payment): save the PDF, then open the printer — once.
  useEffect(() => {
    if (!auto || autoRan.current) return;
    autoRan.current = true;
    const run = async () => {
      // Give the receipt a moment to render/lay out fonts before capturing.
      await new Promise((r) => setTimeout(r, 700));
      try {
        await savePdf(); // downloads Receipt-<n>.pdf automatically
      } catch {
        /* savePdf surfaces its own error */
      }
      setAutoNote("Receipt saved as PDF. Opening the printer…");
      await new Promise((r) => setTimeout(r, 400));
      try {
        window.print();
      } catch {
        /* some devices ignore window.print — the manual buttons remain */
      }
      setAutoNote("Receipt saved. If it didn't print, tap Save image or Print below.");
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {autoNote && <span className="text-[11px] text-jade w-full text-right">{autoNote}</span>}
      {err && <span className="text-[11px] text-ruby w-full text-right">{err}</span>}
      <button onClick={saveImage} disabled={!!busy} className="btn-gold px-4 py-2 text-sm disabled:opacity-60">
        <Icon name="export" className="w-4 h-4" /> {busy === "image" ? "Saving…" : "Save image"}
      </button>
      <button onClick={savePdf} disabled={!!busy} className="btn-ghost px-3 py-2 text-sm disabled:opacity-60">
        <Icon name="receipt" className="w-4 h-4" /> {busy === "pdf" ? "…" : "PDF"}
      </button>
      <button onClick={() => window.print()} className="btn-ghost px-3 py-2 text-sm" title="Printer dialog (desktop / normal browser)">
        <Icon name="pos" className="w-4 h-4" /> Print
      </button>
    </div>
  );
}
