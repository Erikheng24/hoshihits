import "server-only";
import { PROMPT, parseDataUrl, type ProviderReply } from "./vision-core";

/**
 * Groq vision call — a free, no-credit-card second opinion.
 *
 * Groq's API is OpenAI-compatible and runs open vision models (Llama 4) very
 * fast. It exists so the shop is never stuck when Gemini hits its daily limit.
 *
 * Env:
 *   GROQ_API_KEY – free key from console.groq.com (no card required).
 *   GROQ_MODEL   – optional override (default meta-llama/llama-4-scout-17b-16e-instruct).
 */
const MODEL = process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

export const GROQ_CONFIGURED = () => !!process.env.GROQ_API_KEY;

export async function callGroq(dataUrl: string, gameHint?: string): Promise<ProviderReply> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, retriable: true, message: "Groq key not set." };

  // Groq accepts the data URL directly as an image_url, so no need to split it.
  if (!parseDataUrl(dataUrl)) return { ok: false, retriable: false, message: "That image couldn't be read." };

  const promptText = gameHint
    ? `${PROMPT}\n\nThe shopkeeper selected "${gameHint}", but trust the photo over that hint.`
    : PROMPT;

  const body = {
    model: MODEL,
    temperature: 0,
    max_tokens: 512,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });

    if (res.status === 429) return { ok: false, retriable: true, message: "Groq rate limit." };
    if (res.status === 401 || res.status === 403)
      return { ok: false, retriable: false, message: "Groq rejected the request — check GROQ_API_KEY." };
    if (!res.ok) return { ok: false, retriable: true, message: `Groq error ${res.status}.` };

    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) return { ok: false, retriable: true, message: "Groq returned nothing." };
    return { ok: true, retriable: false, text };
  } catch {
    return { ok: false, retriable: true, message: "Couldn't reach Groq." };
  }
}
