import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, str } from "@/lib/api";
import { mapClass } from "@/lib/lenses";
import { WATCH_COLUMNS } from "@/lib/types";
import { overCap, isDuplicate } from "./caps";

// GET: the signed-in member's tracked names. POST: track one more (RLS-scoped).
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const { data, error } = await auth.sb.from("watchlist").select(WATCH_COLUMNS).order("created_at", { ascending: true }).limit(500);
  if (error) return fail(500, "Couldn't load your watchlist — try again.", { code: "db_error" });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ symbol?: unknown; asset_class?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });
  const symbol = str(body.symbol, 40).toUpperCase();
  if (!symbol) return fail(400, "Enter a ticker or pair to track.", { code: "bad_request" });
  const asset_class = mapClass(typeof body.asset_class === "string" ? body.asset_class : "");

  const capped = await overCap(sb, user, "watchlist", "watchlistMax");
  if (capped) {
    // At the cap, re-adding a name that is already tracked is a no-op, not an
    // upsell — answer it the way the client already treats duplicates.
    const { data: existing } = await sb.from("watchlist").select("id").eq("symbol", symbol).maybeSingle();
    if (existing) return fail(409, "Already tracked", { code: "duplicate", duplicate: true });
    return capped;
  }

  // Insert and let the (user_id, symbol) unique index decide duplicates: a
  // check-then-insert races when the same name is tapped twice in quick
  // succession (a double tap, or Track from two screens).
  const { data, error } = await sb
    .from("watchlist")
    .insert({ user_id: user.id, symbol, asset_class, status: "pending" })
    .select(WATCH_COLUMNS)
    .single();
  if (isDuplicate(error)) return fail(409, "Already tracked", { code: "duplicate", duplicate: true });
  if (error) return fail(500, "Couldn't add that — try again.", { code: "db_error" });
  return NextResponse.json({ item: data });
}
