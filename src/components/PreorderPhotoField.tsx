"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";
import { fileToDataUrl } from "@/lib/image-client";

/**
 * Photo picker for a preorder — lets staff attach a reference picture of the
 * exact box or card the customer is ordering, so everyone can see what it is.
 * Renders a hidden `image` field the New Preorder form submits.
 */
export function PreorderPhotoField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string>("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImage(await fileToDataUrl(file, 800, 0.82));
    } catch {
      /* unreadable file — keep whatever we had */
    } finally {
      e.target.value = ""; // allow re-picking the same file
    }
  }

  return (
    <div className="field sm:col-span-2">
      <span>Reference photo</span>
      <input type="hidden" name="image" value={image} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative w-16 h-16 rounded-lg border border-edge bg-panel-2 overflow-hidden shrink-0 grid place-items-center hover:border-gold/40"
          title="Add a photo of the ordered box/card"
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="w-full h-full object-cover" />
          ) : (
            <Icon name="scan" className="w-5 h-5 text-fog" />
          )}
        </button>
        <div className="text-[12px] text-fog">
          {image ? (
            <button type="button" onClick={() => setImage("")} className="text-ruby/80 hover:text-ruby inline-flex items-center gap-1">
              <Icon name="trash" className="w-3.5 h-3.5" /> Remove photo
            </button>
          ) : (
            <span>Optional — attach a picture so you know exactly what the customer ordered.</span>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
    </div>
  );
}
