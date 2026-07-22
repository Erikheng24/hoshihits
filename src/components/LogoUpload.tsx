"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * Logo picker. Downscales to 256px and stores the result as a data URL in a
 * hidden field, so the saved logo stays a few KB rather than a full-size photo.
 */
export function LogoUpload({ initial }: { initial: string | null }) {
  const [logo, setLogo] = useState<string | null>(initial);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        // PNG keeps transparency for logos with a cut-out background.
        setLogo(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <span className="block text-[11px] uppercase tracking-[0.14em] text-fog mb-1.5">Shop logo</span>
      <input type="hidden" name="logo" value={logo ?? ""} />
      <div className="flex items-center gap-3">
        <span className="w-16 h-16 rounded-xl border border-edge bg-panel-2 flex items-center justify-center overflow-hidden shrink-0">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="w-full h-full object-cover" />
          ) : (
            <svg viewBox="0 0 96 96" className="w-8 h-8" aria-hidden="true">
              <path d="M48 16l7.8 20.4L76 44l-20.2 7.6L48 72l-7.8-20.4L20 44l20.2-7.6z" fill="#D4AF37" />
            </svg>
          )}
        </span>
        <div className="flex flex-col gap-1.5">
          <label className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer">
            <Icon name="export" className="w-3.5 h-3.5" /> {logo ? "Change logo" : "Upload logo"}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
          {logo && (
            <button type="button" onClick={() => setLogo(null)} className="btn-ghost px-3 py-1.5 text-[12px] text-ruby/80">
              <Icon name="trash" className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-fog mt-2">Square PNG works best. Shown in the sidebar, login screen and on receipts.</p>
    </div>
  );
}
