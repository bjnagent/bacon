// Market-wide signal snapshot cache. The daily brief's slow part is the fan-out
// of external fetches (Alpha Vantage movers/sectors, FRED macro/commodity/FX,
// SEC EDGAR insiders) — all MARKET-WIDE, identical for every user. This caches
// them in one row per day so Sweep-now and the nightly cron reuse them instead
// of refetching on every cold serverless instance. The user-specific parts of a
// brief (themes, watchlist, news, voices) stay live — they're cheap DB reads.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketSignals, getSectorPerformance, type MarketSignals, type Mover } from "./market";
import { getMacroSnapshot, type MacroIndicator } from "./macro";
import { getCommodityFxSignals, type InstrumentQuote } from "./commodities";
import { getInsiderClusters, type InsiderCluster } from "./insider";
import { communityPulse, grokEnabled } from "./grok";

export interface MarketWide {
  movers: Mover[]; losers: Mover[]; mostActive: Mover[];
  sectors: { sector: string; changePct: string }[];
  macro: MacroIndicator[];
  commodities: InstrumentQuote[]; fx: InstrumentQuote[];
  insiders: InsiderCluster[];
  // Community pulse via Grok/X (null when XAI_API_KEY unset): prompt-grounding
  // text + per-ticker crowding used to stamp calls for the calibration loop.
  pulse?: { text: string; crowding: Record<string, string> } | null;
}

const today = () => new Date().toISOString().slice(0, 10);

// Today's cached bundle, or null if none / not yet written. A bundle counts as
// present only if it carries the expected shape (guards against a `{}` default).
export async function readMarketWide(read: SupabaseClient): Promise<MarketWide | null> {
  try {
    const { data } = await read.from("market_snapshots").select("bundle").eq("snap_date", today()).maybeSingle();
    const b = data?.bundle as MarketWide | undefined;
    if (b && Array.isArray(b.movers) && Array.isArray(b.macro)) return b;
  } catch { /* table missing or unreadable → treat as cold */ }
  return null;
}

// Fetch every market-wide signal live. Each source degrades to empty on failure
// so one bad provider never sinks the brief. `insiderDeadlineMs` bounds the SEC
// fan-out on the interactive path (it can be slow cold); background callers pass
// a larger budget.
export async function fetchMarketWide(insiderDeadlineMs = 8000): Promise<MarketWide> {
  const withDeadline = <T,>(p: Promise<T>, ms: number, fallback: T) =>
    Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
  const [signals, sectors, macro, commodityFx, insiders] = await Promise.all([
    getMarketSignals(8).catch((): MarketSignals => ({ gainers: [], losers: [], mostActive: [] })),
    getSectorPerformance().catch(() => [] as MarketWide["sectors"]),
    getMacroSnapshot().catch(() => [] as MacroIndicator[]),
    getCommodityFxSignals().catch(() => ({ commodities: [] as InstrumentQuote[], fx: [] as InstrumentQuote[] })),
    withDeadline(getInsiderClusters().catch(() => [] as InsiderCluster[]), insiderDeadlineMs, [] as InsiderCluster[]),
  ]);
  // Community pulse rides on the day's most visible tickers (needs the movers,
  // so it runs after the parallel fan-out). One Grok call per day, shared.
  let pulse: MarketWide["pulse"] = null;
  if (grokEnabled()) {
    const tickers = [...signals.gainers, ...signals.mostActive].map((m) => m.ticker).filter(Boolean).slice(0, 10);
    const p = await communityPulse(tickers, "US markets today").catch(() => null);
    if (p) pulse = { text: p.text, crowding: Object.fromEntries(p.crowding) };
  }
  return {
    movers: signals.gainers, losers: signals.losers, mostActive: signals.mostActive,
    sectors, macro, commodities: commodityFx.commodities, fx: commodityFx.fx, insiders, pulse,
  };
}

// Persist today's bundle (service-role/admin client — RLS makes snapshots
// read-only to normal clients). Best-effort: a failed write just means the next
// reader fetches live again.
export async function cacheMarketWide(admin: SupabaseClient, bundle: MarketWide): Promise<void> {
  try { await admin.from("market_snapshots").upsert({ snap_date: today(), bundle, updated_at: new Date().toISOString() }); }
  catch { /* cache is an optimization, never a requirement */ }
}
