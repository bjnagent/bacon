import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDailySeries, computeRoi, cleanTicker, marketDataEnabled, type RoiPoint } from "@/lib/market";
import { resolveInstrument, priceInstrumentRoi, formatLevel, commoditiesEnabled, type Instrument } from "@/lib/commodities";
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

  // Resolve each opportunity to a pricing plan first. Commodity/FX takes priority
  // so a commodity flagged with a ticker-ish symbol isn't mis-priced as an equity.
  type Plan =
    | { kind: "fred"; ins: Instrument }
    | { kind: "equity"; ticker: string }
    | { kind: "skip"; ticker: string; reason: string };
  const plans: Plan[] = items.map((o): Plan => {
    const ins = resolveInstrument(o.ticker, o.name, o.cls);
    if (ins) return ins.investable ? { kind: "fred", ins } : { kind: "skip", ticker: ins.label, reason: "FX pair — tracked as a signal; direction-ambiguous to price" };
    const ticker = cleanTicker(o.ticker);
    if (!ticker) return { kind: "skip", ticker: o.ticker || "—", reason: "no ticker" };
    if (!marketDataEnabled()) return { kind: "skip", ticker, reason: "equity pricing needs MARKET_DATA_API_KEY" };
    return { kind: "equity", ticker };
  });

  // Turn a provider error into a short, friendly reason — the free Alpha Vantage
  // tier answers a hit limit with a chatty "Thank you for using…" note we don't
  // want to dump verbatim into the UI.
  const RATE_LIMIT = "Rate-limited by the market-data provider — try again in a bit";
  const isRateLimit = (m: string) => /alpha vantage|rate limit|per day|per minute|spreading out|premium|thank you for using|standard api/i.test(m);
  const skipReason = (err: unknown) => {
    const m = err instanceof Error ? err.message : "lookup failed";
    return isRateLimit(m) ? RATE_LIMIT : m.slice(0, 90);
  };

  const results: RoiResult[] = new Array(items.length);

  // FRED (commodities/FX): generous rate limits → price in parallel.
  await Promise.all(plans.map(async (plan, i) => {
    if (plan.kind !== "fred") return;
    const o = items[i];
    try {
      const roi = await priceInstrumentRoi(plan.ins, since, INVESTED);
      results[i] = roi
        ? { name: o.name, ...roi, quoteKind: plan.ins.kind, entryQuote: formatLevel(plan.ins, roi.entryClose), asOfQuote: formatLevel(plan.ins, roi.asOfClose) }
        : { name: o.name, ticker: plan.ins.label, skipped: "no price history" };
    } catch (err) {
      results[i] = { name: o.name, ticker: plan.ins.label, skipped: skipReason(err) };
    }
  }));

  // Equities: Alpha Vantage is rate-limited (5/min, 25/day) → keep sequential,
  // and once the limit is hit, stop calling (every extra call just burns budget).
  let rateLimited = false;
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    if (plan.kind === "skip") { results[i] = { name: items[i].name, ticker: plan.ticker, skipped: plan.reason }; continue; }
    if (plan.kind !== "equity") continue;
    const o = items[i];
    if (rateLimited) { results[i] = { name: o.name, ticker: plan.ticker, skipped: RATE_LIMIT }; continue; }
    try {
      const series = await getDailySeries(plan.ticker, since);
      const roi = series && computeRoi(series, since, INVESTED);
      results[i] = roi ? { name: o.name, ...roi } : { name: o.name, ticker: plan.ticker, skipped: "no price history" };
    } catch (err) {
      const reason = skipReason(err);
      if (reason === RATE_LIMIT) rateLimited = true;
      results[i] = { name: o.name, ticker: plan.ticker, skipped: reason };
    }
  }

  const priced = results.filter((r): r is Priced => "value" in r);
  const totals = priced.length ? {
    count: priced.length,
    invested: priced.reduce((s, r) => s + r.invested, 0),
    value: priced.reduce((s, r) => s + r.value, 0),
    asOf: priced.reduce((d, r) => (r.asOfDate > d ? r.asOfDate : d), ""),
    roiPct: 0,
  } : null;
  if (totals) {
    totals.roiPct = (totals.value / totals.invested - 1) * 100;
    // Snapshot the day's totals so the all-time scoreboard aggregates without
    // re-pricing (and re-burning provider rate limits). Best-effort.
    try { await sb.from("daily_briefs").update({ roi: { ...totals, since, at: new Date().toISOString() } }).eq("id", id); } catch { /* additive */ }
  }

  return NextResponse.json({ since, invested: INVESTED, results, totals });
}
