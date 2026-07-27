import "server-only";
import type { ItemKind, ScanFields } from "@/lib/scan";

/**
 * Shared vision-identification logic used by every AI provider.
 *
 * The prompt, the JSON parsing and the field-building are identical no matter
 * which model looks at the photo — only the network call differs. Keeping them
 * here means a new provider is just "send image + PROMPT, return text".
 */

export interface VisionId {
  ok: boolean;
  identified: boolean;
  kind?: ItemKind;
  game?: string;
  language?: string;
  fields: ScanFields;
  message?: string;
  provider?: string; // which AI produced this result
}

/** One provider's answer to "look at this photo": the raw text, or why it failed. */
export interface ProviderReply {
  ok: boolean;
  text?: string;
  /** true when the failure is worth trying the next provider (quota, network, 5xx). */
  retriable: boolean;
  /** true when the provider reported a rate/quota limit (HTTP 429) — drains its battery. */
  rateLimited?: boolean;
  message?: string;
}

export const PROMPT = `You are an expert trading-card inventory assistant for ALL trading card games — not just Pokémon.
Identify the single most prominent item in the photo: a raw card, a graded slab, or a sealed product (booster box, booster pack, elite trainer box, tin, etc.).

CRITICAL RULES:
- Recognise EVERY trading card game equally well: Pokémon, the One Piece Card Game (Bandai), Dragon Ball Super, Digimon, Yu-Gi-Oh!, Union Arena, Weiss Schwarz, Gundam, and Magic. NEVER refuse or return identified:false just because a card is not Pokémon — identify it anyway.
- How to tell the game apart: One Piece cards have a coloured frame, a power/cost number in a bubble, "ONE PIECE CARD GAME" text or the straw-hat/Devil-Fruit logo, and codes like OP01-001, ST01-001, EB01-001, PRB01-001 (leaders say "LEADER"). Dragon Ball Super shows a large power number and "SUPER" / "FUSION WORLD". Yu-Gi-Oh! has ATK/DEF and a set code like ROTA-EN001. Use the frame, logos and codes to decide.
- ALWAYS give the NAME AND SET IN ENGLISH, even when the item is printed in Japanese or another language. Translate to the standard English name and set (e.g. リザードンex → "Charizard ex"; 変幻の仮面 → "Twilight Masquerade"; a Japanese One Piece "モンキー・D・ルフィ" → "Monkey.D.Luffy"). Never output Japanese, Chinese, or Korean characters in the name or set — English only.
- Read the text, symbols, frame and logos printed on the item to identify it, then give the English name.
- Always give your best answer. Set identified to false ONLY if the photo is unreadable or clearly not a trading-card product.

Fields:
- identified: true unless the photo is unreadable / not a card product.
- kind: "raw" for a single loose card, "graded" for a card in a plastic grading case, "sealed" for any sealed/boxed product.
- name: the card or product name IN ENGLISH (translate if the print is Japanese/other), e.g. "Charizard ex", "Surging Sparks Booster Box".
- set: the set / expansion name IN ENGLISH, e.g. "Surging Sparks", "Twilight Masquerade". Give the era in English if you truly can't identify the set.
- game: the TCG — Pokémon, One Piece, Yu-Gi-Oh!, Weiss Schwarz, Union Arena, Magic, Digimon, Dragon Ball, or Gundam.
- rarity: for a raw card, the rarity code printed. Pokémon: AR, SAR, SR, SIR, UR, RRR, CHR, CSR, SSR. One Piece: L (Leader), C, UC, R, SR, SEC, P (Promo), SP, or a "Manga"/alt-art note. Yu-Gi-Oh!: C, R, SR, UR, ScR, QCSR. Blank for sealed/graded.
- cardNumber: the collector number printed — e.g. 073/064 (Pokémon), OP05-060 or ST01-001 (One Piece), ROTA-EN001 (Yu-Gi-Oh!).
- language: the language printed on the physical item (Japanese, English, Chinese, Korean...). This is just a note — the name/set above must still be English.

For a GRADED slab, ALWAYS read the grading label (usually English, along the top of the case) — a slab always has a card name and a grade, so never leave them blank:
- grader: the grading company — PSA, BGS, CGC, SGC, ACE, or TAG.
- grade: the numeric grade, e.g. "10", "9.5", "9". Read only the number.
- certNumber: the certification / serial number on the label (a long digit run). Read it exactly.
Leave grader/grade/certNumber blank for raw cards and sealed products.

For a SEALED box or pack, ALWAYS return the product name and set in English.

Every field must be a short, final plain value — no explanations, no alternatives, no reasoning, no "wait"/"or"/newlines. Leave a field empty rather than discussing it.
Respond with ONLY a JSON object, no markdown fences.`;

export interface RawId {
  identified?: boolean;
  kind?: string;
  name?: string;
  set?: string;
  game?: string;
  rarity?: string;
  cardNumber?: string;
  language?: string;
  grader?: string;
  grade?: string;
  certNumber?: string;
}

export function parseDataUrl(dataUrl: string): { mime: string; data: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return m ? { mime: m[1], data: m[2] } : null;
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences / prose). */
export function extractJson(text: string): RawId | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as RawId;
  } catch {
    return null;
  }
}

/**
 * Turn a model's raw JSON into a clean VisionId.
 * Returns identified:false (not null) when the item couldn't be read, so the
 * orchestrator can decide whether to try another provider.
 */
export function buildVisionId(text: string, gameHint?: string): VisionId {
  const j = extractJson(text);
  if (!j || !j.identified || !j.name) {
    return { ok: true, identified: false, fields: {} };
  }

  // Flash/Llama can occasionally "think out loud" inside a string field. Keep only
  // the first line and collapse whitespace so a rambling value never reaches the UI.
  const trim = (v: unknown, max: number) => {
    if (!v) return undefined;
    const s = String(v).split("\n")[0].replace(/\s+/g, " ").trim();
    return s ? s.slice(0, max) : undefined;
  };
  const kind = (["raw", "graded", "sealed"].includes(j.kind ?? "") ? j.kind : "raw") as ItemKind;
  const grader = trim(j.grader, 10);
  const fields: ScanFields = {
    name: trim(j.name, 90),
    set_name: trim(j.set, 90),
    rarity: trim(j.rarity || j.cardNumber, 20),
  };
  if (kind === "graded") {
    fields.grade_company = grader ? grader.toUpperCase() : undefined;
    fields.grade = trim(j.grade, 6)?.replace(/[^0-9.]/g, "") || undefined;
    fields.cert_number = trim(j.certNumber, 20)?.replace(/[^0-9A-Za-z]/g, "") || undefined;
  }

  return {
    ok: true,
    identified: true,
    kind,
    game: trim(j.game, 40) || gameHint,
    language: trim(j.language, 40),
    fields,
  };
}
