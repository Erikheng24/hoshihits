import "server-only";
import { recordAiScan, markRateLimited, AI_PROVIDERS } from "@/lib/db";
import { buildVisionId, type VisionId } from "./vision-core";
import { callGemini } from "./vision-gemini";
import { callGroq } from "./vision-groq";

/**
 * Photo → card/box identification with auto-fallback across AI providers.
 *
 * Gemini (key 1) is tried first; if it fails, hits its rate limit, or can't
 * read the item, the next configured provider is tried automatically — a second
 * Gemini key (reliable, doubles the free quota), then Groq only if explicitly
 * enabled. Each request is counted against that provider's own daily quota so
 * the battery meters stay accurate, and the winning provider's name is returned
 * so the UI can show which AI answered.
 */

type Caller = (dataUrl: string, gameHint?: string) => ReturnType<typeof callGemini>;

// One entry per provider id in AI_PROVIDERS. `configured` (and thus whether a
// provider runs at all) is owned by AI_PROVIDERS, so this only maps id → call.
const CALLERS: { id: string; call: Caller }[] = [
  { id: "gemini", call: (u, h) => callGemini(u, h, process.env.GEMINI_API_KEY) },
  { id: "gemini2", call: (u, h) => callGemini(u, h, process.env.GEMINI_API_KEY_2) },
  { id: "groq", call: callGroq },
];

export type { VisionId };

export async function identifyPhoto(dataUrl: string, gameHint?: string): Promise<VisionId> {
  const active = CALLERS.filter((p) => AI_PROVIDERS.find((x) => x.id === p.id)?.configured());

  if (active.length === 0) {
    return {
      ok: false,
      identified: false,
      fields: {},
      message:
        "Photo recognition isn't set up yet — add a free GEMINI_API_KEY (aistudio.google.com) or GROQ_API_KEY (console.groq.com) in .env.local, then restart.",
    };
  }

  let lastMessage = "Couldn't identify that item — try a sharper, straight-on photo, or type the name below.";

  for (const provider of active) {
    const reply = await provider.call(dataUrl, gameHint);
    if (reply.rateLimited) markRateLimited(provider.id); // 429 → battery goes red
    else recordAiScan(provider.id); // a real request — count it against this provider's quota

    if (!reply.ok) {
      if (reply.message) lastMessage = reply.message;
      // Retriable or hard rejection — a different provider might still succeed, so keep going.
      continue;
    }

    const vid = buildVisionId(reply.text!, gameHint);
    if (vid.identified && vid.fields.name) {
      const label = AI_PROVIDERS.find((p) => p.id === provider.id)?.label ?? provider.id;
      const noun = vid.kind === "graded" ? "slab" : vid.kind === "sealed" ? "box" : "card";
      const lang = vid.language ? vid.language + " " : "";
      return {
        ...vid,
        provider: provider.id,
        message: `Read from the ${lang}${noun} by ${label} — please confirm the details before saving.`,
      };
    }
    // Provider answered but couldn't identify — let the next one have a look.
  }

  return { ok: true, identified: false, fields: {}, message: lastMessage };
}
