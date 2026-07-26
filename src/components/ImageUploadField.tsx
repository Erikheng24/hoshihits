"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * Generic image upload → hidden field (data URL). Used for payment QR images.
 * Downscales so the stored value stays small, keeping enough detail to scan.
 */
export function ImageUploadField({
  name,
  label,
  hint,
  initial,
  max = 640,
}: {
  name: string;
  label: string;
  hint?: string;
  initial: string | null;
  max?: number;
}) {
  const [img, setImg] = useState<string | null>(initial);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
        setImg(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="field">
      <span>{label}</span>
      <input type="hidden" name={name} value={img ?? ""} />
      <div className="flex items-center gap-3">
        <span className="w-16 h-16 rounded-lg border border-edge bg-panel-2 grid place-items-center overflow-hidden shrink-0">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="w-full h-full object-cover" />
          ) : (
            <Icon name="scan" className="w-6 h-6 text-fog" />
          )}
        </span>
        <div className="flex flex-col gap-1.5">
          <label className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer">
            <Icon name="export" className="w-3.5 h-3.5" /> {img ? "Change" : "Upload"}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
          {img && (
            <button type="button" onClick={() => setImg(null)} className="btn-ghost px-3 py-1.5 text-[12px] text-ruby/80">
              <Icon name="trash" className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-[11px] text-fog mt-1">{hint}</p>}
    </div>
  );
}
