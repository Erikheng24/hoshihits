import "server-only";
import { PROMPT, parseDataUrl, type ProviderReply } from "./vision-core";

/**
 * Google Gemini vision call. Returns the raw model text (or a retriable failure
 * so the orchestrator can fall back to another provider).
 *
 * Env:
 *   GEMINI_API_KEY – required. Free key from aistudio.google.com.
 *   GEMINI_MODEL   – optional override (default gemini-flash-latest, fast).
 */
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export const GEMINI_CONFIGURED = () => !!process.env.GEMINI_API_KEY;

export async function callGemini(dataUrl: string, gameHint?: string): Promise<ProviderReply> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, retriable: true, message: "Gemini key not set." };

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, retriable: false, message: "That image couldn't be read." };

  const promptText = gameHint
    ? `${PROMPT}\n\nThe shopkeeper selected "${gameHint}", but trust the photo over that hint.`
    : PROMPT;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }, { inline_data: { mime_type: parsed.mime, data: parsed.data } }],
      },
    ],
    generationConfig: {
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

    if (res.status === 429) return { ok: false, retriable: true, message: "Gemini rate limit." };
    if (res.status === 400 || res.status === 403)
      return { ok: false, retriable: false, message: "Gemini rejected the request — check GEMINI_API_KEY." };
    if (!res.ok) return { ok: false, retriable: true, message: `Gemini error ${res.status}.` };

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text)
      .filter(Boolean)
      .join("");
    if (!text) return { ok: false, retriable: true, message: "Gemini returned nothing." };
    return { ok: true, retriable: false, text };
  } catch {
    return { ok: false, retriable: true, message: "Couldn't reach Gemini." };
  }
}
