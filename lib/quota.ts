import type { SupabaseClient } from "@supabase/supabase-js";

// Per-user daily cap on expensive web-search AI calls (the P1 the code review
// flagged: without it a single authenticated account can loop /api/analyze and
// run up an unbounded Anthropic + search bill). Backed by the `ai_usage` table
// and the `bump_ai_usage` RPC (supabase/schema.sql).
//
// Fail-OPEN by design: if the RPC or table isn't present yet (migration not
// run), or the call errors, we ALLOW the request. A missing migration must
// never take every AI route down — the worst case is the cap simply isn't
// enforced until the schema is applied.
//
// The default limit is deliberately generous so it never bites a real user's
// normal session; it exists to stop abuse/runaway loops, and later becomes the
// free-tier meter for the paid split (pass a smaller limit for free users).
export const DEFAULT_DAILY_AI_LIMIT = 150;

export async function withinQuota(sb: SupabaseClient, dailyLimit = DEFAULT_DAILY_AI_LIMIT): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("bump_ai_usage", { p_limit: dailyLimit });
    if (error) return true;        // fail-open on any DB/RPC error
    return data !== false;         // rpc returns boolean; only an explicit false blocks
  } catch {
    return true;                   // fail-open
  }
}

export const QUOTA_MESSAGE = "Daily usage limit reached — it resets tomorrow. (This cap keeps costs sane; a Pro tier will lift it.)";
