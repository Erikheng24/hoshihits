"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * Receipt actions: Print and Download PDF.
 *
 * `window.print()` is unreliable on phones — in particular iOS silently ignores
 * it when the app is launched from the Home Screen (standalone PWA). So the PDF
 * is generated in the browser instead, which works on every device and also
 * gives the customer a file you can send over Telegram/WhatsApp.
 */
export function ReceiptActions({ fileName }: { fileName: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function downloadPdf() {
    setErr(null);
    setBusy(true);
    try {
      const node = document.querySelector<HTMLElement>(".print-receipt");
      if (!node) throw new Error("Receipt not found on the page.");

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Render on white so the dark theme doesn't produce an all-black PDF.
      const canvas = await html2canvas(node, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        onclone: (doc) => {
          const el = doc.querySelector<HTMLElement>(".print-receipt");
          if (!el) return;
          el.style.background = "#ffffff";
          el.style.border = "0";
          el.style.boxShadow = "none";
          el.querySelectorAll<HTMLElement>("*").forEach((n) => {
            n.style.color = "#000000";
            n.style.background = "transparent";
            (n.style as any).webkitTextFillColor = "#000000";
            n.style.borderColor = "#999999";
          });
        },
      });

      // 80mm-wide receipt page, height follows the content.
      const widthMm = 80;
      const heightMm = (canvas.height / canvas.width) * widthMm;
      const pdf = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, widthMm, heightMm);
      pdf.save(`${fileName}.pdf`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-[11px] text-ruby max-w-[160px]">{err}</span>}
      <button onClick={() => window.print()} className="btn-ghost px-3 py-2 text-sm" title="Open the printer dialog">
        <Icon name="receipt" className="w-4 h-4" /> Print
      </button>
      <button onClick={downloadPdf} disabled={busy} className="btn-gold px-4 py-2 text-sm disabled:opacity-60">
        <Icon name="export" className="w-4 h-4" /> {busy ? "Making PDF…" : "PDF"}
      </button>
    </div>
  );
}
