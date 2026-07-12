// Property market data (SG + AU), server-only. Real indices from real providers
// — FRED (BIS residential property price indices), data.gov.sg (HDB resale
// price index, URA private residential price index) and the ABS data API (mean
// dwelling price by state) — never the model. Bars reuse the DailyBar shape
// (close = index level or mean price) so the market.ts date-math helpers work.
//
// Every fetcher validates hard and returns [] on any mismatch: a renamed field,
// a blocked host or a changed dataset silently drops that market's card rather
// than ever showing a fabricated number. Country-level BIS series ride the
// already-proven FRED plumbing; the granular SG/AU sources are best-known
// endpoints, overridable via env if the dataset ids drift.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { closeOnOrBefore, type DailyBar, type DailySeries } from "./market";

const FRED_KEY = process.env.FRED_API_KEY;

export interface PropertyMarket {
  key: string;
  label: string;
  country: "SG" | "AU";
  currency: "SGD" | "AUD";
  unit: "index" | "price";   // index = unitless level; price = mean dwelling price
  source: string;            // attribution shown in the UI
}

export const PROPERTY_MARKETS: PropertyMarket[] = [
  { key: "sg",         label: "Singapore — residential",   country: "SG", currency: "SGD", unit: "index", source: "BIS via FRED" },
  { key: "sg-hdb",     label: "Singapore — HDB resale",    country: "SG", currency: "SGD", unit: "index", source: "HDB via data.gov.sg" },
  { key: "sg-private", label: "Singapore — private resi.", country: "SG", currency: "SGD", unit: "index", source: "URA via data.gov.sg" },
  { key: "au",         label: "Australia — residential",   country: "AU", currency: "AUD", unit: "index", source: "BIS via FRED" },
  { key: "au-nsw",     label: "NSW (Sydney) — dwellings",  country: "AU", currency: "AUD", unit: "price", source: "ABS mean dwelling price" },
  { key: "au-vic",     label: "VIC (Melbourne) — dwellings", country: "AU", currency: "AUD", unit: "price", source: "ABS mean dwelling price" },
  { key: "au-qld",     label: "QLD (Brisbane) — dwellings", country: "AU", currency: "AUD", unit: "price", source: "ABS mean dwelling price" },
];

export const marketByKey = (key: string) => PROPERTY_MARKETS.find((m) => m.key === key) ?? null;

// ---------- shared helpers ----------

const clean = (bars: DailyBar[]) =>
  bars.filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && Number.isFinite(b.close) && b.close > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest-first

// "2024-Q1" → "2024-03-31" (quarter end) so quarter data orders like dates.
export function quarterToDate(q: string): string | null {
  const m = q.trim().match(/^(\d{4})[-\s]?Q([1-4])$/i);
  if (!m) return null;
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return `${m[1]}-${ends[Number(m[2]) - 1]}`;
}

// ---------- source fetchers ----------

// FRED: BIS nominal residential property price indices (quarterly).
async function fetchFred(seriesId: string): Promise<DailyBar[]> {
  if (!FRED_KEY) return [];
  const u = new URL("https://api.stlouisfed.org/fred/series/observations");
  u.searchParams.set("series_id", seriesId);
  u.searchParams.set("api_key", FRED_KEY);
  u.searchParams.set("file_type", "json");
  u.searchParams.set("sort_order", "desc");
  u.searchParams.set("limit", "120"); // 30y of quarters
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return clean(((data.observations ?? []) as { date: string; value: string }[])
    .filter((o) => o.value !== "." && o.value !== "")
    .map((o) => ({ date: o.date, close: Number(o.value) })));
}

// data.gov.sg datastore (CKAN): quarterly index rows. Dataset ids are stable in
// practice but overridable via env in case they rotate.
const SG_HDB_RPI_ID = process.env.DATAGOV_SG_HDB_RPI_ID || "d_14f63e595975691e7c24a27ae4c07c79";
const SG_URA_PPI_ID = process.env.DATAGOV_SG_URA_PPI_ID || "d_97f8a2e995022d311c6c68cfda6d034c";

async function fetchDataGovSG(resourceId: string, filter?: (rec: Record<string, unknown>) => boolean): Promise<DailyBar[]> {
  const res = await fetch(`https://data.gov.sg/api/action/datastore_search?resource_id=${encodeURIComponent(resourceId)}&limit=500`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const records = data?.result?.records;
  if (!Array.isArray(records)) return [];
  const bars: DailyBar[] = [];
  for (const rec of records as Record<string, unknown>[]) {
    if (filter && !filter(rec)) continue;
    const q = typeof rec.quarter === "string" ? rec.quarter : null;
    const date = q ? quarterToDate(q) : null;
    const val = Number(rec.index ?? rec.value);
    if (date && Number.isFinite(val) && val > 0) bars.push({ date, close: val });
  }
  return clean(bars);
}

// URA private index carries one row per property type per quarter — keep the
// whole-market series.
const uraWholeMarket = (rec: Record<string, unknown>) => {
  const t = String(rec.property_type ?? rec.type ?? "").toLowerCase();
  return t === "" || /^(all|whole|residential properties)/.test(t);
};

// ABS data API: Total Value of Dwellings — mean dwelling price by state (A$'000,
// quarterly). CSV format is the most stable to parse. Dataflow overridable.
const ABS_TVD_FLOW = process.env.ABS_TVD_FLOW || "ABS,TVD,1.0.0";
const ABS_STATE_CODES: Record<string, string[]> = {
  "au-nsw": ["1", "NSW"], "au-vic": ["2", "VIC"], "au-qld": ["3", "QLD"],
};

async function fetchAbsMeanPrice(marketKey: string): Promise<DailyBar[]> {
  const codes = ABS_STATE_CODES[marketKey];
  if (!codes) return [];
  const res = await fetch(`https://data.api.abs.gov.au/rest/data/${ABS_TVD_FLOW}/all?format=csv&startPeriod=2012-Q1`, {
    cache: "no-store", headers: { Accept: "text/csv" },
  });
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toUpperCase());
  const iTime = header.indexOf("TIME_PERIOD"), iVal = header.indexOf("OBS_VALUE");
  const iRegion = header.findIndex((h) => /REGION|STATE/.test(h));
  const iMeasure = header.findIndex((h) => /MEASURE/.test(h));
  if (iTime < 0 || iVal < 0 || iRegion < 0) return [];
  const bars: DailyBar[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",").map((x) => x.trim().replace(/"/g, ""));
    if (!codes.includes(c[iRegion])) continue;
    // MEASURE 5 = mean price of residential dwellings in the TVD cube; when the
    // column exists, keep only that series (otherwise trust the region filter).
    if (iMeasure >= 0 && !/^(5|MEAN)/i.test(c[iMeasure])) continue;
    const date = quarterToDate(c[iTime]) ?? (/^\d{4}-\d{2}-\d{2}$/.test(c[iTime]) ? c[iTime] : null);
    const val = Number(c[iVal]);
    if (date && Number.isFinite(val) && val > 0) bars.push({ date, close: val * 1000 }); // A$'000 → A$
  }
  return clean(bars);
}

async function fetchMarketBars(key: string): Promise<DailyBar[]> {
  switch (key) {
    case "sg": return fetchFred("QSGN628BIS");
    case "au": return fetchFred("QAUN628BIS");
    case "sg-hdb": return fetchDataGovSG(SG_HDB_RPI_ID);
    case "sg-private": return fetchDataGovSG(SG_URA_PPI_ID, uraWholeMarket);
    case "au-nsw": case "au-vic": case "au-qld": return fetchAbsMeanPrice(key);
    default: return [];
  }
}

// ---------- shared day-cache (mirrors lib/priceCache.ts) ----------

const todayUTC = () => new Date().toISOString().slice(0, 10);

export async function getPropertySeries(read: SupabaseClient, key: string): Promise<DailySeries | null> {
  if (!marketByKey(key)) return null;
  try {
    const { data } = await read.from("property_series").select("bars,fetched_at").eq("series_key", key).maybeSingle();
    if (data && String(data.fetched_at).slice(0, 10) >= todayUTC()) {
      const bars = data.bars as DailyBar[];
      if (Array.isArray(bars) && bars.length) return { ticker: key, bars };
    }
  } catch { /* cold */ }
  const bars = await fetchMarketBars(key).catch(() => [] as DailyBar[]);
  if (!bars.length) return null;
  try { await createAdminClient().from("property_series").upsert({ series_key: key, bars, fetched_at: new Date().toISOString() }); }
  catch { /* cache is best-effort */ }
  return { ticker: key, bars };
}

// ---------- pure math (unit-tested) ----------

export interface MarketStats {
  latest: DailyBar;
  qoqPct: number | null;   // vs previous observation
  yoyPct: number | null;   // vs the observation ~1 year earlier
  spark: number[];         // oldest→newest levels for the sparkline (≤12)
}

export function computeMarketStats(bars: DailyBar[]): MarketStats | null {
  if (!bars.length) return null;
  const latest = bars[0];
  const prev = bars[1] ?? null;
  const yearAgoDate = `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4)}`;
  const yearAgo = closeOnOrBefore({ ticker: "", bars }, yearAgoDate);
  return {
    latest,
    qoqPct: prev ? (latest.close / prev.close - 1) * 100 : null,
    yoyPct: yearAgo && yearAgo.date !== latest.date ? (latest.close / yearAgo.close - 1) * 100 : null,
    spark: bars.slice(0, 12).map((b) => b.close).reverse(),
  };
}

export interface PropertyValuation {
  entryDate: string; entryLevel: number;
  asOfDate: string; asOfLevel: number;
  value: number;    // purchase_price × index growth factor
  deltaPct: number;
}

// Index-implied estimate: scale the purchase price by the market index's move
// since purchase. Explicitly NOT an appraisal — the UI must say so.
export function valueProperty(bars: DailyBar[], purchasePrice: number, purchaseDate: string): PropertyValuation | null {
  if (!bars.length || !(purchasePrice > 0)) return null;
  const entry = closeOnOrBefore({ ticker: "", bars }, purchaseDate) ?? bars[bars.length - 1];
  const latest = bars[0];
  if (!(entry.close > 0) || entry.date > latest.date) return null;
  const factor = latest.close / entry.close;
  return {
    entryDate: entry.date, entryLevel: entry.close,
    asOfDate: latest.date, asOfLevel: latest.close,
    value: purchasePrice * factor, deltaPct: (factor - 1) * 100,
  };
}
