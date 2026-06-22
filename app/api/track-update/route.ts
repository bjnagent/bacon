import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { trackingUpdatePrompt } from "@/lib/prompts";
import { parseTrackingUpdate } from "@/lib/parsers";

export const maxDuration = 60;

// Run a qualitative monitoring update for one tracked name and persist it to the
// row. Returns the parsed update so the client can reflect it immediately.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { id?: string; symbol?: string; assetClass?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const id = String(body.id || "").trim();
  const symbol = String(body.symbol || "").trim();
  const assetClass = String(body.assetClass || "").trim();
  if (!id || !symbol) return NextResponse.json({ error: "Missing id or symbol" }, { status: 400 });

  try {
    const text = await ask(
      trackingUpdatePrompt(),
      [{ role: "user", content: `Asset: ${symbol}\nAsset class: ${assetClass}\n\nGive the monitoring update from current public information.` }],
      true,
      1100
    );
    const u = parseTrackingUpdate(text);
    const last_scan_at = new Date().toISOString();
    await sb.from("watchlist").update({
      update_text: u.update,
      watch_text: u.watch,
      lean: u.lean,
      lean_reason: u.leanReason,
      status: "ok",
      last_scan_at,
    }).eq("id", id);
    return NextResponse.json({ update: { ...u, last_scan_at } });
  } catch (err) {
    await sb.from("watchlist").update({ status: "error" }).eq("id", id);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 });
  }
}
