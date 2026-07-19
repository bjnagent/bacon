import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedSeries } from "@/lib/priceCache";
import { cleanTicker } from "@/lib/market";
import { resolveInstrument } from "@/lib/commodities";
import type { StoredBriefItem } from "@/lib/brief";

export const maxDuration = 300;

// Pre-warm the shared price cache each morning: fetch the union of equity tickers
// across recent briefs + watchlists ONCE and write them through, so even the
// first user of the day gets instant ROI pricing from our own DB instead of
// waiting on an external source. Idempotent — getCachedSeries skips tickers
// already refreshed today. Commodities/FX are excluded (they price via FRED).
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  const tickers = new Set<string>();
  try {
    const { data: briefs } = await admin.from("daily_briefs").select("items").order("brief_date", { ascending: false }).limit(60);
    for (const b of briefs ?? []) for (const o of (b.items ?? []) as StoredBriefItem[]) {
      if (resolveInstrument(o.ticker, o.name, o.cls)) continue; // commodity/FX → FRED, not this cache
      const t = cleanTicker(o.ticker);
      if (t) tickers.add(t);
    }
  } catch { /* briefs optional */ }
  try {
    // Bounded: we only warm up to 60 tickers, so cap the scan (a full-table read
    // of every user's watchlist just to dedupe to 60 grows with the user base).
    // Bias to recently-touched names, which are the ones users will re-price.
    const { data: wl } = await admin.from("watchlist").select("symbol,asset_class").order("last_scan_at", { ascending: false, nullsFirst: false }).limit(500);
    for (const w of wl ?? []) {
      if (resolveInstrument(w.symbol, "", w.asset_class)) continue;
      const t = cleanTicker(w.symbol);
      if (t) tickers.add(t);
    }
  } catch { /* watchlist optional */ }

  const list = [...tickers].slice(0, 60);
  // Reach ~300 days back so the cached history covers old flag dates + MA windows.
  const since = new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 10);

  // Small parallel batches — keyless sources have no per-minute cap, but stay polite.
  let warmed = 0, failed = 0;
  for (let i = 0; i < list.length; i += 6) {
    const batch = list.slice(i, i + 6);
    const res = await Promise.all(batch.map((t) => getCachedSeries(admin, t, since).then((s) => (s && s.bars.length ? 1 : 0)).catch(() => 0)));
    for (const r of res) { if (r) warmed++; else failed++; }
  }
  return NextResponse.json({ ok: true, tickers: list.length, warmed, failed });
}
