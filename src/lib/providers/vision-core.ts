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
  message?: string;
}

export const PROMPT = `You are an expert trading-card inventory assistant for a shop that sells mostly JAPANESE product.
Identify the single most prominent item in the photo: a raw card, a graded slab, or a sealed product (booster box, booster pack, elite trainer box, tin, etc.).

CRITICAL RULES:
- Identify the item AS IT IS. If it is Japanese, return the JAPANESE product — do NOT convert it to the English-language equivalent set or name.
- Read the text and symbols actually printed on the item, and prefer what you can read over guessing.
- Always give your best answer. Set identified to false ONLY if the photo is unreadable or clearly not a trading-card product.

Fields:
- identified: true unless the photo is unreadable / not a card product.
- kind: "raw" for a single loose card, "graded" for a card in a plastic grading case, "sealed" for any sealed/boxed product.
- name: the card or product name AS PRINTED on the item. For Japanese product give the Japanese name, and add the romaji in parentheses, e.g. "リザードンex (Charizard ex)".
- set: the set / expansion name as printed — the JAPANESE set name for Japanese product (e.g. "変幻の仮面"), NOT the English-equivalent set. Give the era if you truly can't read the set.
- game: the TCG — Pokémon, One Piece, Yu-Gi-Oh!, Weiss Schwarz, Union Arena, Magic, Digimon, Dragon Ball, or Gundam.
- rarity: for a raw card, the rarity code printed (AR, SAR, SR, SIR, UR, RRR, CHR, CSR, SSR...); blank for sealed/graded.
- cardNumber: the collector number like 073/064 if visible.
- language: the language printed on the item (Japanese, English, Chinese, Korean...).

For a GRADED slab, ALWAYS read the grading label (usually English, along the top of the case) — a slab always has a card name and a grade, so never leave them blank:
- grader: the grading company — PSA, BGS, CGC, SGC, ACE, or TAG.
- grade: the numeric grade, e.g. "10", "9.5", "9". Read only the number.
- certNumber: the certification / serial number on the label (a long digit run). Read it exactly.
Leave grader/grade/certNumber blank for raw cards and sealed products.

For a SEALED box or pack, ALWAYS return the product name and set, reading the Japanese title if that is what is printed.

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
