// Google Gemini REST client — a cheaper tier for high-volume background work
// (the nightly sweep's scouts, news paraphrasing, and tracked-name updates).
// Mirrors the shape of lib/anthropic.ts's ask() so callers are interchangeable.
// Grounding uses Google Search, so the real-data rule ("never fabricate
// figures — only cite what search returns") still holds on this path.

import { meter, type AiMeta } from "./usage";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

interface GeminiPart { text?: string }
interface GeminiCandidate { content?: { parts?: GeminiPart[] }; finishReason?: string }
interface GeminiUsage { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number }
interface GeminiResponse { candidates?: GeminiCandidate[]; promptFeedback?: { blockReason?: string }; usageMetadata?: GeminiUsage }

// Mirrors ask() minus the maxSearches cap — Gemini's Google Search grounding
// decides and bounds its own queries, so there's no per-call search budget.
export async function askGemini(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  useSearch = true,
  maxTokens = 1100,
  meta?: AiMeta
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      maxOutputTokens: maxTokens,
      // Background tasks are extraction/formatting, not deep reasoning — turn
      // "thinking" off so the cheap tier isn't billed for thinking tokens.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  // Bound below the 300s Fluid ceiling so a hung call surfaces as a readable
  // error (which askCheap turns into a Claude fallback) instead of hanging.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 230_000);
  const t0 = Date.now();
  let metered = false;   // guards against a second row when a metered reply then throws
  try {
    const res = await fetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as GeminiResponse;
    if (meta) {
      const u = data.usageMetadata;
      // promptTokenCount INCLUDES cached tokens, so subtract them out to avoid
      // double-billing the cache portion at the full input rate.
      const cached = u?.cachedContentTokenCount ?? 0;
      meter({
        ...meta, provider: "gemini", model: GEMINI_MODEL, ms: Date.now() - t0,
        usage: { input: Math.max(0, (u?.promptTokenCount ?? 0) - cached), output: u?.candidatesTokenCount ?? 0, cacheRead: cached },
      });
      metered = true;
    }
    if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini returned no text");
    return text;
  } catch (err) {
    if (meta && !metered) meter({ ...meta, provider: "gemini", model: GEMINI_MODEL, usage: { input: 0, output: 0 }, ms: Date.now() - t0, ok: false });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
