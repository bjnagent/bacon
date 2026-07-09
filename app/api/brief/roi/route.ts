import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDailySeries, computeRoi, cleanTicker, marketDataEnabled, type RoiPoint } from "@/lib/market";
import type { StoredBriefItem } from "@/lib/brief";

export const maxDuration = 60;

// The hypothetical: $10,000 placed at each opportunity's flag-day close, valued
// at today's close. Live (not stored) — "today" moves — and grounded entirely
// in real Alpha Vantage prices. Skips items without a resolvable US-equity ticker.
const INVESTED = 10_000;

type RoiResult =
  | ({ name: string; ticker: string } & RoiPoint)
  | { name: string; ticker: string; skipped: string };

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!marketDataEnabled()) return NextResponse.json({ unavailable: true, error: "Market data isn't configured — add MARKET_DATA_API_KEY to price this." });

  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const id = String(body.id || "").trim().slice(0, 64);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: row, error } = await sb.from("daily_briefs").select("id,brief_date,items").eq("id", id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  const items = (row.items ?? []) as StoredBriefItem[];
  const since = String(row.brief_date);

  // Sequential: the free tier is rate-limited (5/min, 25/day); parallel bursts trip it.
  const results: RoiResult[] = [];
  for (const o of items) {
    const ticker = cleanTicker(o.ticker);
    if (!ticker) { results.push({ name: o.name, ticker: o.ticker || "—", skipped: "no ticker" }); continue; }
    try {
      const series = await getDailySeries(ticker, since);
      const roi = series && computeRoi(series, since, INVESTED);
      if (!roi) { results.push({ name: o.name, ticker, skipped: "no price history" }); continue; }
      results.push({ name: o.name, ...roi });
    } catch (err) {
      results.push({ name: o.name, ticker, skipped: err instanceof Error ? err.message.slice(0, 90) : "lookup failed" });
    }
  }

  const priced = results.filter((r): r is { name: string; ticker: string } & RoiPoint => "value" in r);
  const totals = priced.length ? {
    count: priced.length,
    invested: priced.reduce((s, r) => s + r.invested, 0),
    value: priced.reduce((s, r) => s + r.value, 0),
    asOf: priced.reduce((d, r) => (r.asOfDate > d ? r.asOfDate : d), ""),
  } : null;
  if (totals) (totals as { roiPct?: number }).roiPct = (totals.value / totals.invested - 1) * 100;

  return NextResponse.json({ since, invested: INVESTED, results, totals });
}
