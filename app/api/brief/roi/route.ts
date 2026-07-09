import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDailySeries, computeRoi, cleanTicker, marketDataEnabled, type RoiPoint } from "@/lib/market";
import { resolveInstrument, priceInstrumentRoi, formatLevel, commoditiesEnabled } from "@/lib/commodities";
import type { StoredBriefItem } from "@/lib/brief";

export const maxDuration = 60;

// The hypothetical: $10,000 placed at each opportunity's flag-day level, valued
// at today's. Live (not stored) — "today" moves — and grounded entirely in real
// prices: US equities via Alpha Vantage, commodities/FX via FRED. Skips items
// with no resolvable instrument.
const INVESTED = 10_000;

// Commodity/FX rows carry preformatted level strings (e.g. "78.20 $/bbl") so the
// UI shows the entry→now basis in the instrument's own unit, not dollars.
type Priced = { name: string; quoteKind?: "commodity" | "fx"; entryQuote?: string; asOfQuote?: string } & RoiPoint;
type RoiResult = Priced | { name: string; ticker: string; skipped: string };

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!marketDataEnabled() && !commoditiesEnabled()) return NextResponse.json({ unavailable: true, error: "Price data isn't configured — add MARKET_DATA_API_KEY (equities) and/or FRED_API_KEY (commodities & FX) to price this." });

  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const id = String(body.id || "").trim().slice(0, 64);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: row, error } = await sb.from("daily_briefs").select("id,brief_date,items").eq("id", id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  const items = (row.items ?? []) as StoredBriefItem[];
  const since = String(row.brief_date);

  // Sequential: providers are rate-limited (Alpha Vantage 5/min, 25/day); parallel bursts trip them.
  const results: RoiResult[] = [];
  for (const o of items) {
    try {
      // Commodity / FX opportunity → FRED. Takes priority so a commodity flagged
      // with a ticker-ish symbol isn't mis-priced as an equity.
      const ins = resolveInstrument(o.ticker, o.name, o.cls);
      if (ins) {
        if (!ins.investable) { results.push({ name: o.name, ticker: ins.label, skipped: "FX pair — tracked as a signal; direction-ambiguous to price" }); continue; }
        const roi = await priceInstrumentRoi(ins, since, INVESTED);
        if (!roi) { results.push({ name: o.name, ticker: ins.label, skipped: "no price history" }); continue; }
        results.push({ name: o.name, ...roi, quoteKind: ins.kind, entryQuote: formatLevel(ins, roi.entryClose), asOfQuote: formatLevel(ins, roi.asOfClose) });
        continue;
      }
      // Otherwise an equity → Alpha Vantage.
      const ticker = cleanTicker(o.ticker);
      if (!ticker) { results.push({ name: o.name, ticker: o.ticker || "—", skipped: "no ticker" }); continue; }
      if (!marketDataEnabled()) { results.push({ name: o.name, ticker, skipped: "equity pricing needs MARKET_DATA_API_KEY" }); continue; }
      const series = await getDailySeries(ticker, since);
      const roi = series && computeRoi(series, since, INVESTED);
      if (!roi) { results.push({ name: o.name, ticker, skipped: "no price history" }); continue; }
      results.push({ name: o.name, ...roi });
    } catch (err) {
      results.push({ name: o.name, ticker: cleanTicker(o.ticker) || o.ticker || "—", skipped: err instanceof Error ? err.message.slice(0, 90) : "lookup failed" });
    }
  }

  const priced = results.filter((r): r is Priced => "value" in r);
  const totals = priced.length ? {
    count: priced.length,
    invested: priced.reduce((s, r) => s + r.invested, 0),
    value: priced.reduce((s, r) => s + r.value, 0),
    asOf: priced.reduce((d, r) => (r.asOfDate > d ? r.asOfDate : d), ""),
  } : null;
  if (totals) (totals as { roiPct?: number }).roiPct = (totals.value / totals.invested - 1) * 100;

  return NextResponse.json({ since, invested: INVESTED, results, totals });
}
