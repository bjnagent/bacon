// AI metering — every model call bacon makes gets a row in `ai_events` with the
// real token counts the provider reported and the dollar cost at the time of the
// call. Two reasons this exists:
//
//   1. Cost visibility. `ai_usage` (the quota gate) counts CALLS, which says
//      nothing about spend — a 200-token settings tweak and a 40k-token
//      web-searched briefing are the same row there.
//   2. Behaviour. Which routes users actually reach for, how heavy each one is,
//      and which users are outliers, is the input to pricing the paid tier.
//
// Cost is computed and STORED at write time, not derived at read time, so
// historical spend doesn't silently re-price itself when a rate card changes.
//
// Every function here is best-effort: metering must never break a user request.

import { createAdminClient } from "./supabase/admin";

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  webSearches?: number;
}

/** Where a call came from — set by the route, carried through the AI helpers. */
export interface AiMeta {
  route: string;
  userId?: string | null;   // null/undefined = system (cron) call
}

// USD per 1M tokens, plus USD per server-side search. Search is metered
// separately because it's material here: /api/analyze allows up to 6 searches,
// so a briefing can spend more on search than on tokens.
interface Rate { in: number; out: number; search: number }

// Anthropic public rates. Keys are matched by longest prefix, so
// `claude-sonnet-4-6-20260101` resolves to the `claude-sonnet-4-6` row.
// Web search is $10 / 1,000 requests across models.
const A = (i: number, o: number): Rate => ({ in: i, out: o, search: 0.01 });
const ANTHROPIC_RATES: Record<string, Rate> = {
  "claude-fable-5": A(10, 50),
  "claude-mythos-5": A(10, 50),
  "claude-opus-5": A(5, 25),
  "claude-opus-4-8": A(5, 25),
  "claude-opus-4-7": A(5, 25),
  "claude-opus-4-6": A(5, 25),
  "claude-sonnet-5": A(3, 15),
  "claude-sonnet-4-6": A(3, 15),
  "claude-haiku-4-5": A(1, 5),
};

// Non-Anthropic providers move fast and aren't first-party to us, so their token
// rates are overridable by env ("IN/OUT" per 1M, e.g. XAI_RATE="0.3/0.5")
// without a deploy. Defaults are the published list prices at time of writing;
// when a model isn't in the table at all the event is still recorded with tokens
// but `priced=false`, so the console can show "unpriced" rather than a
// confidently wrong $0.
const envRate = (name: string, fallback: Rate): Rate => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const [i, o] = raw.split("/").map((s) => Number(s.trim()));
  return Number.isFinite(i) && Number.isFinite(o) ? { ...fallback, in: i, out: o } : fallback;
};

// Google Search grounding is free below the daily free tier, so 0 here — and we
// don't capture a Gemini search count anyway. xAI Live Search bills $25 / 1,000
// sources, which its `num_sources_used` reports.
const OTHER_RATES = (): Record<string, Rate> => ({
  "gemini-2.5-flash": envRate("GEMINI_RATE", { in: 0.3, out: 2.5, search: 0 }),
  "gemini-2.5-pro": envRate("GEMINI_RATE", { in: 1.25, out: 10, search: 0 }),
  "grok-3-mini": envRate("XAI_RATE", { in: 0.3, out: 0.5, search: 0.025 }),
  "grok-3": envRate("XAI_RATE", { in: 3, out: 15, search: 0.025 }),
  "grok-4": envRate("XAI_RATE", { in: 3, out: 15, search: 0.025 }),
});

function rateFor(model: string): Rate | null {
  const m = model.toLowerCase();
  const table: Record<string, Rate> = { ...ANTHROPIC_RATES, ...OTHER_RATES() };
  // Longest-prefix match so dated model IDs (…-20260101) still price correctly.
  let best: { key: string; rate: Rate } | null = null;
  for (const [key, rate] of Object.entries(table)) {
    if (m.startsWith(key) && (!best || key.length > best.key.length)) best = { key, rate };
  }
  return best?.rate ?? null;
}

export interface CostResult { costUsd: number; priced: boolean }

/**
 * Dollar cost of one call. Pure — no I/O — so it's unit-testable.
 *
 * Cache accounting follows Anthropic's model: reads bill at 0.1x the input rate,
 * 5-minute writes at 1.25x. `input` from the API already EXCLUDES cached tokens,
 * so the three are summed, not overlapped.
 */
export function estimateCostUsd(model: string, u: TokenUsage): CostResult {
  const rate = rateFor(model);
  if (!rate) return { costUsd: 0, priced: false };
  const M = 1_000_000;
  const cost =
    (u.input * rate.in +
      (u.cacheRead ?? 0) * rate.in * 0.1 +
      (u.cacheWrite ?? 0) * rate.in * 1.25 +
      u.output * rate.out) / M +
    (u.webSearches ?? 0) * rate.search;
  // 6dp matches the numeric(12,6) column; sub-microdollar calls round to 0 but
  // still carry their token counts.
  return { costUsd: Math.round(cost * 1e6) / 1e6, priced: true };
}

export interface AiEventInput extends AiMeta {
  provider: "anthropic" | "gemini" | "xai";
  model: string;
  usage: TokenUsage;
  ms?: number;
  ok?: boolean;
}

/**
 * Write one metering row. Fire-and-forget from the caller's perspective: a
 * metering failure is swallowed, never surfaced. Uses the service-role client
 * because cron calls have no user session and RLS on `ai_events` is read-only
 * for users by design (no INSERT policy — writes are server-side only).
 */
export async function recordAiEvent(e: AiEventInput): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const { costUsd, priced } = estimateCostUsd(e.model, e.usage);
    await createAdminClient().from("ai_events").insert({
      user_id: e.userId ?? null,
      route: e.route.slice(0, 80),
      provider: e.provider,
      model: e.model.slice(0, 80),
      input_tokens: Math.max(0, Math.round(e.usage.input || 0)),
      output_tokens: Math.max(0, Math.round(e.usage.output || 0)),
      cache_read_tokens: Math.max(0, Math.round(e.usage.cacheRead || 0)),
      cache_write_tokens: Math.max(0, Math.round(e.usage.cacheWrite || 0)),
      web_searches: Math.max(0, Math.round(e.usage.webSearches || 0)),
      cost_usd: costUsd,
      priced,
      ms: e.ms ?? null,
      ok: e.ok ?? true,
    });
  } catch {
    // Metering is observability, not business logic — never fail the request.
  }
}

/** Non-blocking variant: schedules the write and returns immediately. */
export function meter(e: AiEventInput): void {
  void recordAiEvent(e);
}
