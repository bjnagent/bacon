import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTopGainers } from "@/lib/market";
import { getMacroSnapshot } from "@/lib/macro";
import { generateBrief, briefToRows } from "@/lib/brief";
import { SCOUT_PICK_COLUMNS, type ScoutPickRow } from "@/lib/types";

export const maxDuration = 60;

function assemble(rows: ScoutPickRow[]) {
  const introRow = rows.find((r) => r.kind === "brief-intro");
  const items = rows.filter((r) => r.kind === "opportunity");
  return {
    intro: introRow?.why || null,
    caveat: introRow?.check_text || null,
    generatedAt: items[0]?.created_at ?? introRow?.created_at ?? null,
    items: items.map((r) => ({
      id: r.id, name: r.name, ticker: r.symbol, cls: r.asset_class,
      horizon: r.data_source || "", thesis: r.why, signals: r.now_catalyst, checks: r.check_text,
    })),
  };
}

// GET: today's (latest) opportunity brief for the signed-in user.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await sb.from("scout_picks").select(SCOUT_PICK_COLUMNS).in("kind", ["opportunity", "brief-intro"]).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brief: assemble((data ?? []) as ScoutPickRow[]) });
}

// POST: generate the brief on demand — same synthesis the nightly sweep runs,
// scoped to the current user's session (RLS enforces row ownership).
export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const [movers, macro, themesRes, trackedRes, newsRes] = await Promise.all([
      getTopGainers(8).catch(() => []),
      getMacroSnapshot().catch(() => []),
      sb.from("themes").select("label"),
      sb.from("watchlist").select("symbol"),
      sb.from("news_items").select("headline,source,why").order("created_at", { ascending: false }).limit(10),
    ]);
    const brief = await generateBrief({
      movers,
      headlines: (newsRes.data ?? []).map((n) => ({ head: n.headline, source: n.source, why: n.why })),
      macro,
      themes: (themesRes.data ?? []).map((t) => t.label),
      tracked: (trackedRes.data ?? []).map((t) => t.symbol),
    });
    const rows = briefToRows(user.id, brief);
    if (rows.length) {
      await sb.from("scout_picks").delete().in("kind", ["opportunity", "brief-intro"]);
      await sb.from("scout_picks").insert(rows);
    }
    const { data } = await sb.from("scout_picks").select(SCOUT_PICK_COLUMNS).in("kind", ["opportunity", "brief-intro"]).order("created_at", { ascending: false });
    return NextResponse.json({ brief: assemble((data ?? []) as ScoutPickRow[]) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Brief generation failed" }, { status: 500 });
  }
}
