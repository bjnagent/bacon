import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapClass } from "@/lib/lenses";

// Minimal "save to radar" persistence used by the Analyze view. RLS ensures the
// row is scoped to the signed-in user. The full Radar (Scout + Tracking) CRUD
// lands in a later Phase 2 slice.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { symbol?: string; asset_class?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const symbol = String(body.symbol || "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  const asset_class = mapClass(body.asset_class);

  const { error } = await sb.from("watchlist").insert({ user_id: user.id, symbol, asset_class });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
