// Provider routing for background / bulk work.
//
// askCheap() prefers Gemini (far cheaper per token) for high-volume, secondary
// tasks — the nightly sweep's mover/theme scouts, news paraphrasing, and
// tracked-name updates — and falls back to Claude on any Gemini error OR an
// empty/degenerate response. So the output format and the real-data guarantee
// never hinge on Gemini succeeding: worst case, Claude answers as before.
//
// User-facing surfaces (the morning brief, six-lens analysis, chat, debate,
// personas, track-record review) keep calling ask()/askStream() directly and
// always run on Claude.

import { ask } from "./anthropic";
import { askGemini, geminiEnabled } from "./gemini";

// A reply shorter than this almost always means Gemini refused or the delimited
// format broke — hand it to Claude rather than persist an empty/garbled feed.
const MIN_USEFUL_CHARS = 40;

export async function askCheap(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  useSearch = true,
  maxTokens = 1100,
  maxSearches?: number
): Promise<string> {
  if (geminiEnabled()) {
    try {
      const out = await askGemini(system, messages, useSearch, maxTokens);
      if (out.length >= MIN_USEFUL_CHARS) return out;
    } catch { /* fall through to Claude */ }
  }
  return ask(system, messages, useSearch, maxTokens, maxSearches);
}
