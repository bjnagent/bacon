import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, str } from "@/lib/api";
import { askCheap } from "@/lib/ai";
import { trackingUpdatePrompt } from "@/lib/prompts";
import { parseTrackingUpdate } from "@/lib/parsers";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";
import { gate } from "@/lib/entitlements";

export const maxDuration = 300;

// Refresh the qualitative monitoring update for one tracked name, persist it on
// the row, and return it so the client can reflect it immediately.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ id?: unknown; symbol?: unknown; assetClass?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });
  const id = str(body.id, 64);
  if (!id) return fail(400, "Missing id", { code: "bad_request" });

  // Read the row first (RLS-scoped): a stale or foreign id must 404 before a
  // unit is consumed, and the stored symbol is what we actually research — the
  // body's copy is only a fallback for rows saved before asset_class existed.
  const { data: row } = await sb.from("watchlist").select("id,symbol,asset_class").eq("id", id).maybeSingle();
  if (!row) return fail(404, "That name is no longer on your watchlist.", { code: "not_found" });
  const symbol = String(row.symbol || str(body.symbol, 120));
  const assetClass = String(row.asset_class || str(body.assetClass, 60));

  if (!(await withinQuota(sb))) return fail(429, QUOTA_MESSAGE, { code: "quota" });
  const g = await gate(sb, user, "track-update");
  if (!g.ok) return g.response;

  try {
    // askCheap, not ask(): a refresh is a short, delimited monitoring note — the
    // same job the nightly sweep already runs on the bulk tier. The plan's unit
    // economics budget ~$0.03 per "update" (lib/plans UNIT_COST_USD), and the
    // ai_events ledger had this route on Sonnet at ~$0.11 each, so every manual
    // refresh lost money. askCheap falls back to Claude on any empty/garbled
    // reply, so the output format never depends on the cheap provider.
    const text = await askCheap(
      trackingUpdatePrompt(),
      [{ role: "user", content: `Asset: ${symbol}\nAsset class: ${assetClass}\n\nGive the monitoring update from current public information.` }],
      true,
      1100,
      4,
      { route: "track-update", userId: user.id },
    );
    const u = parseTrackingUpdate(text);
    if (!u.update) throw new Error("empty update");
    const last_scan_at = new Date().toISOString();
    await sb.from("watchlist").update({
      update_text: u.update,
      watch_text: u.watch,
      lean: u.lean,
      lean_reason: u.leanReason,
      status: "ok",
      last_scan_at,
    }).eq("id", id);
    return NextResponse.json({ update: { ...u, last_scan_at }, remaining: g.remaining });
  } catch {
    await g.refund();
    // Keep the previous update visible; only flag that this attempt failed.
    await sb.from("watchlist").update({ status: "error" }).eq("id", id);
    return fail(502, "Couldn't refresh that update — try again in a minute.", { code: "upstream" });
  }
}
