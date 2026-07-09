// Real macro data from FRED (Federal Reserve Bank of St. Louis), server-only.
// Like lib/market.ts, this is a real-provider numeric source — the only kind
// Bacon is allowed. Values are returned verbatim and attributed to FRED; the
// model never invents them. Cached in-process to stay well under FRED limits.

const KEY = process.env.FRED_API_KEY;
export const MACRO_SOURCE = "FRED";
export function macroEnabled(): boolean {
  return !!KEY;
}

export interface MacroIndicator {
  key: string;
  label: string;
  value: string;  // formatted
  unit: string;
  asOf: string;   // observation date (YYYY-MM-DD)
  change: number | null; // change vs prior observation (level series only)
}

interface SeriesCfg {
  key: string;
  id: string;       // FRED series id
  label: string;
  unit: string;
  decimals: number;
  units?: string;   // FRED transform, e.g. "pc1" = % change from year ago
}

const SERIES: SeriesCfg[] = [
  { key: "fedfunds", id: "FEDFUNDS", label: "Fed funds", unit: "%", decimals: 2 },
  { key: "y10",      id: "DGS10",    label: "10Y UST",   unit: "%", decimals: 2 },
  { key: "y2",       id: "DGS2",     label: "2Y UST",    unit: "%", decimals: 2 },
  { key: "curve",    id: "T10Y2Y",   label: "10Y–2Y",    unit: "%", decimals: 2 },
  { key: "cpi",      id: "CPIAUCSL", label: "CPI YoY",   unit: "%", decimals: 1, units: "pc1" },
  { key: "unrate",   id: "UNRATE",   label: "Unemployment", unit: "%", decimals: 1 },
  { key: "vix",      id: "VIXCLS",   label: "VIX",       unit: "",  decimals: 1 },
  { key: "usd",      id: "DTWEXBGS", label: "US Dollar", unit: "",  decimals: 2 }, // broad trade-weighted dollar index
];

async function fetchSeries(cfg: SeriesCfg): Promise<MacroIndicator | null> {
  const u = new URL("https://api.stlouisfed.org/fred/series/observations");
  u.searchParams.set("series_id", cfg.id);
  u.searchParams.set("api_key", KEY!);
  u.searchParams.set("file_type", "json");
  u.searchParams.set("sort_order", "desc");
  u.searchParams.set("limit", "8");
  if (cfg.units) u.searchParams.set("units", cfg.units);
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  const obs: Array<{ date: string; value: string }> = (data.observations ?? []).filter((o: { value: string }) => o.value !== "." && o.value !== "");
  if (!obs.length) return null;
  const latest = obs[0];
  const prior = obs[1];
  const val = Number(latest.value);
  if (!Number.isFinite(val)) return null;
  const change = (!cfg.units && prior && Number.isFinite(Number(prior.value))) ? val - Number(prior.value) : null;
  return { key: cfg.key, label: cfg.label, value: val.toFixed(cfg.decimals), unit: cfg.unit, asOf: latest.date, change };
}

let cache: { at: number; data: MacroIndicator[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h — macro series update daily/monthly

export async function getMacroSnapshot(): Promise<MacroIndicator[]> {
  if (!KEY) return [];
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const results = await Promise.all(SERIES.map((s) => fetchSeries(s).catch(() => null)));
  const data = results.filter((r): r is MacroIndicator => !!r);
  if (data.length) cache = { at: Date.now(), data };
  return data;
}
