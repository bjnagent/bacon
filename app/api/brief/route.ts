import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readMarketWide, fetchMarketWide } from "@/lib/snapshot";
import { buildSignalBundle, briefToRows, briefToDailyRow, splitVoices } from "@/lib/brief";
import { recordCalls, horizonToDays, getCalibrationMemo } from "@/lib/calls";
import { cleanTicker } from "@/lib/market";
import { parseOpportunities } from "@/lib/parsers";
import { opportunityBriefPrompt } from "@/lib/prompts";
import { askStream } from "@/lib/anthropic";
import { textStreamResponse } from "@/lib/streamRoute";
import { SCOUT_PICK_COLUMNS, type ScoutPickRow } from "@/lib/types";

export const maxDuration = 300;

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
      action: r.action || "", target: r.target || "",
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
// scoped to the current user's session (RLS enforces row ownership). STREAMS
// the raw synthesis text so opportunity cards appear as they're written; the
// parsed result is persisted after the last chunk.
export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Market-wide signals: reuse today's cached snapshot (warmed by the nightly
  // cron) so Sweep-now doesn't refetch every external provider on a cold
  // instance. On a miss, fetch live with a short insider deadline so the stream's
  // first byte isn't held up. The user-specific parts below stay live and cheap.
  const [marketWide, calibration, themesRes, trackedRes, newsRes, settingsRes] = await Promise.all([
    readMarketWide(sb).then((cached) => cached ?? fetchMarketWide(2500)),
    getCalibrationMemo(sb),
    sb.from("themes").select("label"),
    sb.from("watchlist").select("symbol"),
    sb.from("news_items").select("headline,source,why").order("created_at", { ascending: false }).limit(10),
    sb.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const bundle = buildSignalBundle({
    movers: marketWide.movers,
    losers: marketWide.losers,
    mostActive: marketWide.mostActive,
    sectors: marketWide.sectors,
    headlines: (newsRes.data ?? []).map((n) => ({ head: n.headline, source: n.source, why: n.why })),
    macro: marketWide.macro,
    themes: (themesRes.data ?? []).map((t) => t.label),
    tracked: (trackedRes.data ?? []).map((t) => t.symbol),
    insiders: marketWide.insiders,
    voices: splitVoices((settingsRes.data as { voices?: string } | null)?.voices),
    commodities: marketWide.commodities,
    fx: marketWide.fx,
    pulse: marketWide.pulse?.text,
    calibration,
  });

  return textStreamResponse(
    askStream(opportunityBriefPrompt(), [{ role: "user", content: bundle }], true, 1800, 6),
    async (full, ok) => {
      if (!ok) return; // stream errored mid-flight — don't persist a truncated brief
      const brief = parseOpportunities(full);
      if (!brief.items.length) return;
      await sb.from("daily_briefs").upsert({ ...briefToDailyRow(user.id, brief), brief_date: new Date().toISOString().slice(0, 10) }, { onConflict: "user_id,brief_date" });
      const rows = briefToRows(user.id, brief);
      await sb.from("scout_picks").delete().in("kind", ["opportunity", "brief-intro"]);
      await sb.from("scout_picks").insert(rows);
      // Calibration: file every actionable call, stamped with community
      // crowding at call time so the loop can grade hot vs quiet entries.
      const crowding = marketWide.pulse?.crowding ?? {};
      await recordCalls(sb, user.id, brief.items.filter((o) => o.action).map((o) => ({
        source: "brief" as const,
        instrument: (o.ticker && o.ticker !== "—" ? o.ticker : o.name),
        action: o.action, targetText: o.target,
        horizonDays: horizonToDays(o.horizon),
        crowded: crowding[cleanTicker(o.ticker) ?? ""] ?? null,
      })));
    }
  );
}
