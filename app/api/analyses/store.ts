// Server-side I/O for persisted analyses — not a route (only route.ts files are).
//
// The rules (what counts as the same symbol, fresh, shareable) are pure and
// live in lib/analysisStore.ts; this file only runs the queries. Every read of
// the member's own rows goes through their RLS-scoped client. The one exception
// is the shared-cache lookup, which by definition reads OTHER members' rows and
// so needs the service role — it selects only non-personal originals and never
// returns their deep-tool extras (copyRow drops them).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ROW_COLUMNS, SHARED_TTL_MS, copyRow, mergeExtras, pickOwn, pickShared,
  type AnalysisRow, type ExtraKey, type ToolResult,
} from "@/lib/analysisStore";

/** The member's own newest usable analysis of `symbol` (by filed key or typed query) within `ttlMs`. */
export async function findOwn(sb: SupabaseClient, userId: string, symbol: string, cls: string | null, ttlMs: number): Promise<AnalysisRow | null> {
  try {
    // Filter the window in SQL, then match in code: a row filed as "NKE" must
    // answer a request for what was typed ("NIKE"), and the matching rule is
    // shared with the client — not re-expressed as a PostgREST or-filter.
    const since = new Date(Date.now() - ttlMs).toISOString();
    // RLS already scopes this to the member; the explicit filter also matches
    // the (user_id, created_at) index.
    const { data, error } = await sb.from("analyses").select(ROW_COLUMNS)
      .eq("user_id", userId).gt("created_at", since).order("created_at", { ascending: false }).limit(60);
    if (error || !data) return null;
    return pickOwn(data as AnalysisRow[], symbol, cls, ttlMs);
  } catch {
    return null;
  }
}

/** The newest shareable analysis of `key` from any member (class-scoped when given). */
export async function findShared(key: string, cls: string | null): Promise<AnalysisRow | null> {
  // No service role (local dev, preview without secrets): no sharing, not an error.
  if (!key || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const since = new Date(Date.now() - SHARED_TTL_MS).toISOString();
    let q = createAdminClient().from("analyses").select(ROW_COLUMNS)
      .eq("symbol", key).eq("personal", false).is("shared_from", null)
      .gt("created_at", since);
    if (cls) q = q.eq("asset_class", cls);
    // A few candidates, not one: the newest may be gapped or incomplete, and
    // pickShared skips those rather than serving them.
    const { data, error } = await q.order("created_at", { ascending: false }).limit(5);
    if (error || !data) return null;
    return pickShared(data as AnalysisRow[]);
  } catch {
    return null;
  }
}

/**
 * File a shared hit into the member's history (free). Reuses an existing copy
 * of the same original, so reopening a shared name doesn't stack duplicates.
 * Resolves to the member's row, or null when it couldn't be written — the
 * content is still served; it just won't be in history.
 */
export async function copyToUser(sb: SupabaseClient, userId: string, hit: AnalysisRow, query: string): Promise<AnalysisRow | null> {
  if (hit.user_id === userId) return hit;
  try {
    const { data: existing } = await sb.from("analyses").select(ROW_COLUMNS).eq("user_id", userId).eq("shared_from", hit.id).limit(1);
    if (existing && existing.length) return existing[0] as AnalysisRow;
    const { data, error } = await sb.from("analyses").insert(copyRow(hit, userId, query)).select(ROW_COLUMNS).single();
    if (error || !data) return null;
    return data as AnalysisRow;
  } catch {
    return null;
  }
}

/**
 * Merge one deep-tool result into an analysis's extras so reopening restores
 * it instead of billing it again. Best-effort: the result has already been
 * paid for and is returned to the caller either way. Resolves true if saved.
 */
export async function saveToolResult(sb: SupabaseClient, id: string, key: ExtraKey, value: ToolResult): Promise<boolean> {
  try {
    const { data, error } = await sb.from("analyses").select("extras").eq("id", id).maybeSingle();
    if (error || !data) return false;
    const extras = mergeExtras((data as { extras?: unknown }).extras, { [key]: value });
    const { error: upErr } = await sb.from("analyses").update({ extras }).eq("id", id);
    return !upErr;
  } catch {
    return false;
  }
}
