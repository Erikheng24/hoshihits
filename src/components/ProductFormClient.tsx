"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./icons";
import { ScanCapture } from "./ScanCapture";
import { fileToDataUrl } from "@/lib/image-client";
import type { ScanFields, ScanMode, EnrichResult } from "@/lib/scan";

const GAMES = [
  "Pokémon", "One Piece", "Yu-Gi-Oh!", "Weiss Schwarz", "Union Arena",
  "Magic", "Digimon", "Dragon Ball", "Gundam", "Accessories",
];

interface ProductLike {
  id?: number;
  name: string; game: string; category: string; set_name?: string | null; rarity?: string | null;
  condition?: string | null; language?: string | null; foil?: number;
  grade_company?: string | null; grade?: string | null; cert_number?: string | null;
  barcode?: string | null; image?: string | null;
  price: number; cost: number; stock: number; low_stock: number;
}

export function ProductFormClient({
  product,
  basePath,
  editingId,
  action,
  enrich,
}: {
  product: ProductLike;
  basePath: string;
  editingId?: number;
  action: (formData: FormData) => void | Promise<void>;
  enrich: (kind: "graded" | "sealed", code: string) => Promise<EnrichResult>;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [image, setImage] = useState<string | null>(product.image ?? null);
  const [scanImage, setScanImage] = useState<string>(""); // new capture to submit

  // Scannable fields live in state so a scan can fill them; the rest stay uncontrolled.
  const [f, setF] = useState({
    name: product.name ?? "",
    category: product.category ?? "sealed",
    set_name: product.set_name ?? "",
    rarity: product.rarity ?? "",
    condition: product.condition ?? "",
    grade_company: product.grade_company ?? "",
    grade: product.grade ?? "",
    cert_number: product.cert_number ?? "",
    barcode: product.barcode ?? "",
  });
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  const scanMode: ScanMode = f.category === "graded" ? "graded" : f.category === "single" ? "single" : "sealed";

  /** Straight photo upload for manually-entered products (no scanning involved). */
  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      setImage(url);
      setScanImage(url); // submitted with the form
    } catch {
      /* unreadable file — leave the existing photo alone */
    } finally {
      e.target.value = ""; // allow re-picking the same file
    }
  }

  function applyScan(fields: ScanFields, img: string) {
    setImage(img);
    setScanImage(img);
    set({
      ...(fields.name ? { name: fields.name } : {}),
      ...(fields.set_name ? { set_name: fields.set_name } : {}),
      ...(fields.rarity ? { rarity: fields.rarity } : {}),
      ...(fields.condition ? { condition: fields.condition } : {}),
      ...(fields.grade_company ? { grade_company: fields.grade_company } : {}),
      ...(fields.grade ? { grade: fields.grade } : {}),
      ...(fields.cert_number ? { cert_number: fields.cert_number } : {}),
      ...(fields.barcode ? { barcode: fields.barcode } : {}),
    });
    setScanOpen(false);
  }

  return (
    <>
      {/* Scan banner */}
      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="w-full mb-5 rounded-xl border border-gold/30 bg-gold/[0.06] hover:bg-gold/[0.1] transition-colors p-4 flex items-center gap-4 text-left"
      >
        {image ? (
          <img src={image} alt="" className="w-14 h-14 rounded-lg object-cover border border-edge shrink-0" />
        ) : (
          <span className="w-14 h-14 rounded-lg bg-gold/10 border border-gold/25 text-gold flex items-center justify-center shrink-0">
            <Icon name="scan" className="w-6 h-6" />
          </span>
        )}
        <span className="flex-1">
          <span className="block text-white font-medium">
            {image ? "Rescan" : scanMode === "graded" ? "Scan slab QR code" : scanMode === "sealed" ? "Scan box barcode" : "Scan card"}
          </span>
          <span className="block text-[12px] text-fog">
            {scanMode === "graded"
              ? "Reads the slab QR and pulls the name, cert #, grade and photo from PSA."
              : scanMode === "sealed"
              ? "Reads the box barcode and pulls the product name and photo."
              : "Photographs the card and fills the name, number and rarity."}
          </span>
        </span>
        <Icon name="chevronRight" className="w-4 h-4 text-fog" />
      </button>

      {/* Plain photo upload — for products typed in by hand */}
      <div className="flex items-center gap-3 mb-5 rounded-xl border border-edge bg-panel-2 p-3">
        <span className="w-16 h-16 rounded-lg border border-edge bg-panel overflow-hidden flex items-center justify-center shrink-0">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="w-full h-full object-cover" />
          ) : (
            <Icon name="card" className="w-6 h-6 text-fog/60" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-white">Product photo</p>
          <p className="text-[11px] text-fog">Shows in Inventory and on the POS buttons — easier to spot at a glance.</p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <label className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer whitespace-nowrap">
            <Icon name="export" className="w-3.5 h-3.5" /> {image ? "Change" : "Upload"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          </label>
          {image && (
            <button type="button" onClick={() => { setImage(null); setScanImage("__clear__"); }} className="btn-ghost px-3 py-1.5 text-[12px] text-ruby/80">
              <Icon name="trash" className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
      </div>

      <form action={action} className="grid sm:grid-cols-2 gap-4">
        <input type="hidden" name="id" value={editingId ?? ""} />
        <input type="hidden" name="returnTo" value={basePath} />
        <input type="hidden" name="image" value={scanImage} />

        <label className="field sm:col-span-2"><span>Product name *</span>
          <input name="name" required className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Surging Sparks Booster Box" />
        </label>
        <label className="field"><span>Game / line</span>
          <select name="game" className="input" defaultValue={product.game}>
            {GAMES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field"><span>Category</span>
          <select name="category" className="input" value={f.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="sealed">Sealed</option>
            <option value="single">Single</option>
            <option value="graded">Graded</option>
            <option value="accessory">Accessory</option>
          </select>
        </label>
        <label className="field"><span>Set</span><input name="set_name" className="input" value={f.set_name} onChange={(e) => set({ set_name: e.target.value })} /></label>
        <label className="field"><span>Rarity / card #</span><input name="rarity" className="input" value={f.rarity} onChange={(e) => set({ rarity: e.target.value })} placeholder="SIR / 199/165…" /></label>
        <label className="field"><span>Condition</span>
          <select name="condition" className="input" value={f.condition} onChange={(e) => set({ condition: e.target.value })}>
            <option value="">—</option>
            {["NM", "LP", "MP", "HP", "DMG"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field"><span>Language</span>
          <select name="language" className="input" defaultValue={product.language ?? "EN"}>
            {["EN", "JP", "KR", "CN"].map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label className="field"><span>Grading company</span>
          <select name="grade_company" className="input" value={f.grade_company} onChange={(e) => set({ grade_company: e.target.value })}>
            <option value="">Raw / not graded</option>
            {["PSA", "BGS", "CGC", "SGC", "ACE", "TAG"].map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field"><span>Grade</span><input name="grade" className="input" value={f.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="10 / 9.5…" /></label>
        <label className="field"><span>Cert number</span><input name="cert_number" className="input num" value={f.cert_number} onChange={(e) => set({ cert_number: e.target.value })} /></label>
        <label className="field"><span>Barcode</span><input name="barcode" className="input num" value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} /></label>
        <label className="field"><span>Sell price ($) *</span>
          <input name="price" type="number" step="0.01" min="0" required className="input num" defaultValue={product.price ? (product.price / 100).toFixed(2) : ""} />
        </label>
        <label className="field"><span>Cost ($)</span>
          <input name="cost" type="number" step="0.01" min="0" className="input num" defaultValue={product.cost ? (product.cost / 100).toFixed(2) : ""} />
        </label>
        <label className="field"><span>Stock</span>
          <input name="stock" type="number" min="0" className="input num" defaultValue={product.stock} />
        </label>
        <label className="field"><span>Low-stock alert at</span>
          <input name="low_stock" type="number" min="0" className="input num" defaultValue={product.low_stock} />
        </label>
        <label className="flex items-center gap-2 text-sm text-mist sm:col-span-2">
          <input type="checkbox" name="foil" defaultChecked={!!product.foil} className="accent-[#D4AF37]" /> Foil / holo
        </label>
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <Link href={basePath} className="btn-ghost px-4 py-2 text-sm">Cancel</Link>
          <button className="btn-gold px-5 py-2 text-sm">{editingId ? "Save changes" : "Create product"}</button>
        </div>
      </form>

      {scanOpen && <ScanCapture mode={scanMode} enrich={enrich} onApply={applyScan} onClose={() => setScanOpen(false)} />}
    </>
  );
}
