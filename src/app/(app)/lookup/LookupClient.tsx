"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { money } from "@/lib/format";
import { fileToDataUrl } from "@/lib/image-client";
import { parseScan, type ItemKind, type EnrichResult } from "@/lib/scan";

const GAMES = [
  "Pokémon", "One Piece", "Yu-Gi-Oh!", "Weiss Schwarz", "Union Arena",
  "Magic", "Digimon", "Dragon Ball", "Gundam",
];

/**
 * Identify a card or box from a photo.
 * Reads the printed text with on-device OCR, then looks the name up in the TCG
 * catalog for the official set, number and market price.
 */
export function LookupClient({
  enrich,
}: {
  enrich: (kind: ItemKind, code: string, game?: string) => Promise<EnrichResult>;
}) {
  const [game, setGame] = useState("Pokémon");
  const [image, setImage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<null | "reading" | "searching">(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function search(name: string) {
    if (!name.trim()) return;
    setBusy("searching");
    setErr(null);
    try {
      setResult(await enrich("raw", name.trim(), game));
    } catch {
      setErr("Lookup failed — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setResult(null);
    setProgress(0);
    try {
      const url = await fileToDataUrl(file, 900, 0.9);
      setImage(url);
      setBusy("reading");
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(url, "eng", {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      const parsed = parseScan(data.text ?? "", "single");
      if (parsed.name) {
        setQuery(parsed.name);
        await search(parsed.name);
      } else {
        setBusy(null);
        setErr("Couldn't read a name from that photo. Type it below, or try a sharper, straight-on shot.");
      }
    } catch {
      setBusy(null);
      setErr("Couldn't read that image.");
    } finally {
      e.target.value = "";
    }
  }

  const f = result?.fields;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* ---- input ---- */}
      <div className="card p-5">
        <p className="text-[13px] text-mist mb-3">
          Take or upload a photo of the card or box. It reads the printed name, then finds the official set and market price.
        </p>

        <div className="flex gap-2 mb-3">
          <select className="input !w-auto" value={game} onChange={(e) => setGame(e.target.value)}>
            {GAMES.map((g) => <option key={g}>{g}</option>)}
          </select>
          <label className="btn-gold px-4 py-2 text-sm cursor-pointer flex-1 justify-center">
            <Icon name="scan" className="w-4 h-4" /> Photo
            <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </label>
        </div>

        <div className="flex gap-2">
          <input
            className="input"
            placeholder="…or type a card / box name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(query)}
          />
          <button onClick={() => search(query)} disabled={!query.trim() || !!busy} className="btn-ghost px-4 text-sm shrink-0 disabled:opacity-40">
            Search
          </button>
        </div>

        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="mt-4 rounded-lg border border-edge max-h-56 mx-auto" />
        )}

        {busy && (
          <div className="mt-4 text-center">
            <span className="inline-flex items-center gap-2 text-mist text-sm">
              <span className="w-4 h-4 rounded-full border-2 border-gold/40 border-t-gold animate-spin" />
              {busy === "reading" ? "Reading the photo…" : "Searching the catalog…"}
            </span>
            {progress > 0 && busy === "reading" && (
              <div className="h-1.5 rounded-full bg-edge overflow-hidden mt-3 max-w-xs mx-auto">
                <div className="h-full bg-gold/70 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {err && <p className="text-[12px] text-amberish mt-3">{err}</p>}
      </div>

      {/* ---- result ---- */}
      <div className="card p-5">
        {!result ? (
          <div className="py-14 text-center">
            <span className="inline-flex w-12 h-12 rounded-2xl border border-edge bg-panel-2 text-fog items-center justify-center mb-3">
              <Icon name="search" className="w-5 h-5" />
            </span>
            <p className="text-mist text-sm">No card looked up yet</p>
            <p className="text-fog text-[12px] mt-1">Take a photo or type a name to begin.</p>
          </div>
        ) : (
          <>
            <div className="flex gap-4">
              {result.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.image} alt="" className="w-28 rounded-lg border border-edge object-contain shrink-0" />
              ) : (
                <div className="w-28 h-40 rounded-lg border border-edge bg-panel-2 flex items-center justify-center text-fog shrink-0">
                  <Icon name="card" className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-white text-lg leading-snug">{f?.name ?? "Not identified"}</p>
                {f?.set_name && <p className="text-mist text-sm mt-0.5">{f.set_name}</p>}
                {f?.rarity && <p className="text-fog text-[12px] mt-0.5 num">No. {f.rarity}</p>}
                <p className="mt-3">
                  {result.marketPrice ? (
                    <span className="num text-jade text-xl font-semibold">{money(result.marketPrice)}</span>
                  ) : (
                    <span className="text-fog text-sm">No market price available</span>
                  )}
                  {result.marketPrice ? <span className="block text-[11px] text-fog">estimated market value</span> : null}
                </p>
              </div>
            </div>
            {result.message && <p className="text-[12px] text-amberish mt-4">{result.message}</p>}
            <p className="text-[11px] text-fog mt-4 leading-relaxed">
              Prices come from public TCG catalogues and are a guide, not a quote — always check condition yourself.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
