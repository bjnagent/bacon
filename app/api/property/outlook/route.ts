import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askStream } from "@/lib/anthropic";
import { propertyOutlookPrompt } from "@/lib/prompts";
import { parseDebate } from "@/lib/parsers";
import { normStance } from "@/lib/lenses";
import { marketByKey, getPropertySeries, computeMarketStats } from "@/lib/property";
import { textStreamResponse } from "@/lib/streamRoute";

export const maxDuration = 300;

// POST: a web-search-grounded qualitative outlook for one property market,
// seeded with the REAL index stats (the only numbers the model may assert).
// Streams; the parsed result is persisted per user+market after the last chunk.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { market?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const market = marketByKey(String(body.market || ""));
  if (!market) return NextResponse.json({ error: "Unknown market" }, { status: 400 });

  const series = await getPropertySeries(sb, market.key).catch(() => null);
  const stats = series ? computeMarketStats(series.bars) : null;
  const fmt = (n: number) => market.unit === "price" ? `${market.currency} ${Math.round(n).toLocaleString("en-US")}` : n.toFixed(1);
  const statsLine = stats
    ? `latest ${market.unit === "price" ? "mean dwelling price" : "index"} ${fmt(stats.latest.close)} as of ${stats.latest.date} (${market.source})${stats.qoqPct != null ? `; QoQ ${stats.qoqPct >= 0 ? "+" : ""}${stats.qoqPct.toFixed(1)}%` : ""}${stats.yoyPct != null ? `; YoY ${stats.yoyPct >= 0 ? "+" : ""}${stats.yoyPct.toFixed(1)}%` : ""}`
    : "no index data available right now — say so and rely only on attributed web_search findings";

  return textStreamResponse(
    askStream(propertyOutlookPrompt(market.label, statsLine), [{ role: "user", content: `Write the current outlook for ${market.label}.` }], true, 900, 5),
    async (full, ok) => {
      if (!ok) return; // don't persist a truncated outlook
      const sec = parseDebate(full); // generic ===SECTION=== splitter
      if (!sec.READ) return;
      const bodyJson = {
        read: sec.READ, drivers: sec.DRIVERS || "", confirm: sec.CONFIRM || "", kill: sec.KILL || "",
        stance: normStance((sec.STANCE || "").split(/[—-]/)[0]),
        stanceWhy: (sec.STANCE || "").replace(/^[^—-]*[—-]\s*/, "").trim(),
      };
      await sb.from("property_outlooks").upsert({ user_id: user.id, market_key: market.key, body: bodyJson, created_at: new Date().toISOString() }, { onConflict: "user_id,market_key" });
    }
  );
}
