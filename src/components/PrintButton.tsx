"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * Report actions on the print page: Print (browser dialog) and Save as photo
 * (renders the report sheet to a PNG — handy for sharing on phones/Telegram).
 */
export function PrintButton({ fileName = "report" }: { fileName?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveImage() {
    setErr(null);
    setBusy(true);
    try {
      const node = document.querySelector<HTMLElement>(".print-sheet");
      if (!node) throw new Error("Report not found.");
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true, windowWidth: 1120 });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Could not render the image.");
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      // Phones: native share sheet → Save Image / send to Telegram. Desktop: download.
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: fileName }); return; }
        catch (e) { if ((e as { name?: string })?.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${fileName}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-[11px] text-red-500">{err}</span>}
      <button
        onClick={saveImage}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white text-neutral-800 px-3.5 py-2 text-sm hover:bg-neutral-100 transition-colors disabled:opacity-60"
      >
        <Icon name="export" className="w-4 h-4" /> {busy ? "Saving…" : "Save photo"}
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg bg-[#1a1a1a] text-white px-4 py-2 text-sm hover:bg-black transition-colors"
      >
        <Icon name="pos" className="w-4 h-4" /> Print
      </button>
    </div>
  );
}
