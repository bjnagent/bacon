import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { getDailySeries, cleanTicker, type DailySeries, type DailyBar } from "./market";

// Shared, DB-backed price cache in front of the multi-source fetch. A ticker's
// full daily history is fetched at most ONCE per UTC day — across every user and
// serverless instance — then served from ticker_series. Historical closes are
// immutable, so a cached series always covers past flag dates; only "today's
// close" is the reason to refresh. Net effect: ROI pricing almost never touches
// an external source, so provider tiers/limits stop mattering.
//
// Read via the caller's (authenticated) client; write-through via the service
// role, since RLS makes ticker_series read-only to normal clients.

const todayUTC = () => new Date().toISOString().slice(0, 10);

export async function getCachedSeries(read: SupabaseClient, rawTicker: string, since?: string): Promise<DailySeries | null> {
  const ticker = cleanTicker(rawTicker);
  if (!ticker) return null;
  const reaches = (bars: DailyBar[]) => bars.length > 0 && (!since || bars[bars.length - 1].date <= since);

  try {
    const { data } = await read.from("ticker_series").select("bars,fetched_at").eq("ticker", ticker).maybeSingle();
    // Fresh = refreshed today (UTC). ISO date strings compare chronologically.
    if (data && String(data.fetched_at).slice(0, 10) >= todayUTC()) {
      const bars = data.bars as DailyBar[];
      if (Array.isArray(bars) && reaches(bars)) return { ticker, bars };
    }
  } catch { /* table missing / unreadable → fall through to a live fetch */ }

  // Miss or stale → fetch multi-source (may throw on a hard rate limit) and write
  // it through so everyone else today reads it from our own DB.
  const series = await getDailySeries(ticker, since);
  if (series && series.bars.length) {
    try { await createAdminClient().from("ticker_series").upsert({ ticker, bars: series.bars, fetched_at: new Date().toISOString() }); }
    catch { /* cache write is best-effort */ }
  }
  return series;
}
