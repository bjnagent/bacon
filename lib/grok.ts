// Grok (xAI) — the community-pulse provider. Grok's differentiator is live X
// access, which neither Claude nor Gemini web search covers well: what retail /
// fintwit is actually crowding into RIGHT NOW. Used two ways: as grounding in
// the analysis prompts, and as an ASSESSMENT axis — every call bacon makes is
// stamped hot/warm/quiet at call time, so the calibration loop can measure how
// calls perform when the crowd is loud vs silent (crowding at entry is one of
// the most predictive context variables there is).
//
// Optional, like Gemini: unset XAI_API_KEY → every helper degrades to null and
// the rest of bacon behaves exactly as before.

const KEY = process.env.XAI_API_KEY;
const MODEL = process.env.XAI_MODEL || "grok-3-mini";

export function grokEnabled(): boolean {
  return !!KEY;
}

async function askGrok(system: string, user: string, maxTokens = 700, signal?: AbortSignal): Promise<string | null> {
  if (!KEY) return null;
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    // Live Search over X — the whole point of using Grok here.
    search_parameters: { mode: "auto", sources: [{ type: "x" }], max_search_results: 15 },
  };
  // Combine the caller's deadline signal with the hard 45s cap, so when the
  // caller's shorter race loses, this call is actually ABORTED (not left running
  // to 45s while its X Live-Search is billed for a discarded result).
  const timeout = () => (signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000));
  const call = async (payload: object) => fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: timeout(),
  });
  try {
    let res = await call(body);
    if (!res.ok && res.status === 400) {
      // Older API surface without search_parameters — retry plain (Grok still
      // carries recent X knowledge; weaker, but not useless).
      const plain: Record<string, unknown> = { ...body };
      delete plain.search_parameters;
      res = await call(plain);
    }
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim().length > 20 ? text.trim() : null;
  } catch { return null; }
}

export interface CommunityPulse {
  text: string;                        // full delimited pulse, for prompt injection
  crowding: Map<string, string>;       // TICKER -> hot | warm | quiet
}

// One pulse call covering a set of tickers/topics. The CROWDING block is
// machine-parsed (feeds the calibration loop); the rest is prompt grounding.
export async function communityPulse(topics: string[], context = "US markets", signal?: AbortSignal): Promise<CommunityPulse | null> {
  const list = topics.filter(Boolean).slice(0, 12);
  if (!list.length || !KEY) return null;
  const text = await askGrok(
    `You are a market-community analyst with live X (Twitter) access. Report what the investing community is ACTUALLY saying right now — retail chatter, fintwit, notable accounts — about the given names. Be concrete and cite the vibe honestly (hype, fear, silence). Community sentiment is noisy and often a CONTRARIAN indicator at extremes — flag euphoria and capitulation explicitly. Output ONLY:
===PULSE===
<4-6 sentences: the community read across these names — who's being hyped, who's ignored, notable voices, meme momentum, sentiment shifts in the last days>
===CROWDING===
<one line per name, EXACTLY: "TICKER: hot|warm|quiet — <5-word why>">
===CONTRARIAN===
<1-2 sentences: where the crowd looks MOST wrong — euphoric tops or fear-driven bottoms>`,
    `Context: ${context}\nNames: ${list.join(", ")}\n\nWhat is the community saying right now?`,
    700,
    signal,
  );
  if (!text) return null;
  const crowding = new Map<string, string>();
  const block = text.match(/===\s*CROWDING\s*===([\s\S]*?)(?:===|$)/i)?.[1] ?? "";
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*-?\s*([A-Z0-9./-]{1,12})\s*:\s*(hot|warm|quiet)/i);
    if (m) crowding.set(m[1].toUpperCase(), m[2].toLowerCase());
  }
  return { text, crowding };
}
