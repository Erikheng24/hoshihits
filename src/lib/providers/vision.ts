import "server-only";
import type { ItemKind, ScanFields } from "@/lib/scan";
import { recordAiScan } from "@/lib/db";

/**
 * Photo → card/box identification with Google Gemini vision.
 *
 * Unlike OCR (which only reads printed Latin text), a vision model recognises the
 * product from its artwork and any language of text — so a Japanese booster box or
 * an angled slab photo identifies cleanly. Runs server-side so the API key stays
 * out of the browser.
 *
 * Env:
 *   GEMINI_API_KEY   – required. Free key from aistudio.google.com.
 *   GEMINI_MODEL     – optional model override (default gemini-flash-latest, fast).
 *   GEMINI_GROUNDING – set to "1" to enable Google Search grounding, which lets the
 *                      model look product names up on the web (matches the Gemini
 *                      website). Requires billing enabled on the Google project;
 *                      without it the API rejects grounded calls with HTTP 429.
 */

// "gemini-flash-latest" tracks the current fast Flash model, so it won't retire
// out from under us and stays responsive (a second or two per scan).
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GROUNDING = process.env.GEMINI_GROUNDING === "1";

export interface VisionId {
  ok: boolean;
  identified: boolean;
  kind?: ItemKind;
  game?: string;
  language?: string;
  fields: ScanFields;
  message?: string;
}

const PROMPT = `You are an expert trading-card inventory assistant for a shop that sells mostly JAPANESE product.
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

Every field must be a short, final plain value — no explanations, no alternatives, no reasoning, no "wait"/"or"/newlines. Leave a field empty rather than discussing it.`;

interface RawId {
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

function parseDataUrl(dataUrl: string): { mime: string; data: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return m ? { mime: m[1], data: m[2] } : null;
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences / prose). */
function extractJson(text: string): RawId | null {
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

export async function identifyPhoto(dataUrl: string, gameHint?: string): Promise<VisionId> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return {
      ok: false,
      identified: false,
      fields: {},
      message:
        "Photo recognition isn't set up yet — add a free GEMINI_API_KEY in .env.local (from aistudio.google.com), then restart.",
    };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, identified: false, fields: {}, message: "That image couldn't be read." };

  const promptText = gameHint
    ? `${PROMPT}\n\nThe shopkeeper selected "${gameHint}", but trust the photo over that hint.`
    : PROMPT;

  // Grounding (web search) can't be combined with responseSchema, so we ask for
  // JSON in the prompt and parse it leniently. Without grounding we use strict
  // structured output for clean fields.
  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          { text: GROUNDING ? `${promptText}\n\nRespond with ONLY a JSON object, no markdown.` : promptText },
          { inline_data: { mime_type: parsed.mime, data: parsed.data } },
        ],
      },
    ],
    generationConfig: GROUNDING
      ? { temperature: 0 }
      : {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              identified: { type: "boolean" },
              kind: { type: "string", enum: ["raw", "graded", "sealed"] },
              name: { type: "string" },
              set: { type: "string" },
              game: { type: "string" },
              rarity: { type: "string" },
              cardNumber: { type: "string" },
              language: { type: "string" },
              grader: { type: "string" },
              grade: { type: "string" },
              certNumber: { type: "string" },
            },
            required: ["identified"],
          },
        },
  };
  if (GROUNDING) body.tools = [{ google_search: {} }];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      }
    );
    recordAiScan(); // a request was sent — count it against today's quota

    if (res.status === 429)
      return {
        ok: false,
        identified: false,
        fields: {},
        message: GROUNDING
          ? "Web search quota reached — enable billing on your Google project, or turn GEMINI_GROUNDING off."
          : "Photo AI is busy (rate limit) — wait a moment and try again.",
      };
    if (res.status === 400 || res.status === 403)
      return { ok: false, identified: false, fields: {}, message: "Photo AI rejected the request — check the GEMINI_API_KEY in .env.local." };
    if (!res.ok)
      return { ok: false, identified: false, fields: {}, message: "Couldn't reach the photo AI just now — type the name below instead." };

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text)
      .filter(Boolean)
      .join("");
    if (!text) return { ok: false, identified: false, fields: {}, message: "Photo AI returned nothing — try a clearer shot." };

    const j = extractJson(text);
    if (!j || !j.identified || !j.name) {
      return {
        ok: true,
        identified: false,
        fields: {},
        message: "Couldn't identify that item — try a sharper, straight-on photo, or type the name below.",
      };
    }

    // Flash can occasionally "think out loud" inside a string field. Keep only the
    // first line and collapse whitespace so a rambling value never reaches the UI.
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
    // Graded slabs: carry the grading label the AI read off the case.
    if (kind === "graded") {
      fields.grade_company = grader ? grader.toUpperCase() : undefined;
      fields.grade = trim(j.grade, 6)?.replace(/[^0-9.]/g, "") || undefined;
      fields.cert_number = trim(j.certNumber, 20)?.replace(/[^0-9A-Za-z]/g, "") || undefined;
    }

    return {
      ok: true,
      identified: true,
      kind,
      game: trim(j.game, 40),
      language: trim(j.language, 40),
      fields,
    };
  } catch {
    return { ok: false, identified: false, fields: {}, message: "Photo AI request failed — type the name below instead." };
  }
}
