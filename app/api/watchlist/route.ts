import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapClass } from "@/lib/lenses";
import { WATCH_COLUMNS } from "@/lib/types";

// GET: list the signed-in user's tracked names. POST: add one (RLS-scoped).
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await sb.from("watchlist").select(WATCH_COLUMNS).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { symbol?: string; asset_class?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const symbol = String(body.symbol || "").trim().toUpperCase().slice(0, 40);
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  const asset_class = mapClass(body.asset_class);

  // Avoid duplicate symbols per user.
  const { data: existing } = await sb.from("watchlist").select("id").eq("symbol", symbol).maybeSingle();
  if (existing) return NextResponse.json({ error: "Already tracked", duplicate: true }, { status: 409 });

  const { data, error } = await sb
    .from("watchlist")
    .insert({ user_id: user.id, symbol, asset_class, status: "pending" })
    .select(WATCH_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
