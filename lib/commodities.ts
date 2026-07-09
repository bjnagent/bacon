// Real commodity + FX levels from FRED (Federal Reserve Bank of St. Louis) —
// the same generous-rate-limit provider that powers the macro strip. These
// become first-class signals in the daily brief (alongside equity movers) and
// let commodity/FX opportunities be priced in the track record's $10K view.
//
// Why FRED and not Alpha Vantage: AV's free tier is 25 requests/DAY total —
// adding commodity/FX pulls there would starve the core equity movers feed.
// FRED is generous and returns full history, so one series covers both the
// current level (signal) and the flag-day level (ROI).

import { computeRoi, type DailySeries, type RoiPoint } from "./market";

const KEY = process.env.FRED_API_KEY;
export function commoditiesEnabled(): boolean {
  return !!KEY;
}

export interface Instrument {
  key: string;
  series: string;      // FRED series id
  label: string;       // display label
  unit: string;        // suffix shown after the level, e.g. " $/bbl" ("" for FX)
  decimals: number;
  kind: "commodity" | "fx";
  aliases: string[];   // UPPERCASE symbols/keywords used to map an opportunity back to this instrument
  investable: boolean; // ROI only when "level up = a long position gains" (FRED quotes USD-per-foreign for EUR/GBP; USD/JPY is inverted → signal-only)
}

// Scoped deliberately: a few liquid majors, not an exhaustive board — enough to
// give the synthesis real commodity/FX context without a sprawling fetch.
export const INSTRUMENTS: Instrument[] = [
  { key: "wti",    series: "DCOILWTICO",   label: "WTI crude",   unit: " $/bbl",   decimals: 2, kind: "commodity", aliases: ["WTI", "CL", "USO", "DCOILWTICO"], investable: true },
  { key: "brent",  series: "DCOILBRENTEU", label: "Brent crude", unit: " $/bbl",   decimals: 2, kind: "commodity", aliases: ["BRENT", "BNO", "BZ"], investable: true },
  { key: "natgas", series: "DHHNGSP",      label: "Nat gas",     unit: " $/MMBtu", decimals: 2, kind: "commodity", aliases: ["NATGAS", "NG", "UNG", "HENRYHUB"], investable: true },
  { key: "copper", series: "PCOPPUSDM",    label: "Copper",      unit: " $/mt",    decimals: 0, kind: "commodity", aliases: ["COPPER", "CPER", "HG"], investable: true }, // monthly
  { key: "eur",    series: "DEXUSEU",      label: "EUR/USD",     unit: "",         decimals: 4, kind: "fx",        aliases: ["EURUSD", "EUR/USD", "EUR", "FXE"], investable: true },
  { key: "gbp",    series: "DEXUSUK",      label: "GBP/USD",     unit: "",         decimals: 4, kind: "fx",        aliases: ["GBPUSD", "GBP/USD", "GBP", "FXB"], investable: true },
  { key: "jpy",    series: "DEXJPUS",      label: "USD/JPY",     unit: "",         decimals: 2, kind: "fx",        aliases: ["USDJPY", "USD/JPY", "JPY", "FXY"], investable: false },
];

export interface InstrumentQuote { key: string; label: string; value: string; unit: string; changePct: string | null; asOf: string; kind: "commodity" | "fx" }

const fmtLevel = (n: number, decimals: number) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

interface Obs { date: string; value: number }

// FRED observations for one series, newest-first. Returns [] (never throws) so a
// single unavailable series can't sink the whole feed.
async function fredSeries(id: string, limit: number): Promise<Obs[]> {
  if (!KEY) return [];
  const u = new URL("https://api.stlouisfed.org/fred/series/observations");
  u.searchParams.set("series_id", id);
  u.searchParams.set("api_key", KEY);
  u.searchParams.set("file_type", "json");
  u.searchParams.set("sort_order", "desc");
  u.searchParams.set("limit", String(limit));
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.observations ?? []) as { date: string; value: string }[])
    .filter((o) => o.value !== "." && o.value !== "")
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => Number.isFinite(o.value));
}

// --- Signal feed (current levels + move vs prior observation) ---
let quoteCache: { at: number; data: { commodities: InstrumentQuote[]; fx: InstrumentQuote[] } } | null = null;
const QUOTE_TTL_MS = 6 * 60 * 60 * 1000; // commodity/FX marks move daily at most for these series

export async function getCommodityFxSignals(): Promise<{ commodities: InstrumentQuote[]; fx: InstrumentQuote[] }> {
  const empty = { commodities: [], fx: [] };
  if (!KEY) return empty;
  if (quoteCache && Date.now() - quoteCache.at < QUOTE_TTL_MS) return quoteCache.data;
  const quotes = await Promise.all(INSTRUMENTS.map(async (ins): Promise<InstrumentQuote | null> => {
    const obs = await fredSeries(ins.series, 5).catch(() => [] as Obs[]);
    if (!obs.length) return null;
    const latest = obs[0], prior = obs[1];
    const chg = prior && prior.value ? (latest.value / prior.value - 1) * 100 : null;
    return {
      key: ins.key, label: ins.label, value: fmtLevel(latest.value, ins.decimals), unit: ins.unit,
      changePct: chg == null ? null : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`, asOf: latest.date, kind: ins.kind,
    };
  }));
  const ok = quotes.filter((q): q is InstrumentQuote => !!q);
  const out = { commodities: ok.filter((q) => q.kind === "commodity"), fx: ok.filter((q) => q.kind === "fx") };
  if (ok.length) quoteCache = { at: Date.now(), data: out };
  return out;
}

// --- Instrument resolution (map a brief opportunity to an instrument) ---
// Conservative: an exact ticker-alias match, or a name/ticker keyword gated by a
// commodity/FX asset class — so a random equity is never mistaken for a barrel.
export function resolveInstrument(ticker?: string | null, name?: string | null, cls?: string | null): Instrument | null {
  const t = (ticker || "").toUpperCase().replace(/[^A-Z/]/g, "");
  const n = (name || "").toUpperCase();
  const c = (cls || "").toUpperCase();
  const isCommodity = /COMMOD/.test(c), isFx = /\bFX\b|CURRENC|FOREX/.test(c);
  // A bare ticker resolves only on a DISTINCTIVE alias (≥3 chars) — the 2-char
  // ones (NG, CL, HG, BZ) are also equity tickers, so those need the class hint.
  if (t) { const exact = INSTRUMENTS.find((ins) => ins.aliases.some((a) => a.length >= 3 && a === t)); if (exact) return exact; }
  if (isCommodity || isFx) {
    for (const ins of INSTRUMENTS) {
      if ((ins.kind === "commodity" && isCommodity) || (ins.kind === "fx" && isFx)) {
        // Name keywords need ≥3 chars (a 2-char substring like "CL" hides inside
        // "nuclear"); the short ticker aliases match only the ticker field.
        if (ins.aliases.some((a) => (a.length >= 3 && n.includes(a)) || (a.length >= 2 && t.includes(a)))) return ins;
      }
    }
  }
  return null;
}

// --- ROI series (full history for the $10K math) ---
const seriesCache = new Map<string, { at: number; data: DailySeries }>();
const SERIES_TTL_MS = 6 * 60 * 60 * 1000;

async function getInstrumentSeries(ins: Instrument, since?: string): Promise<DailySeries | null> {
  if (!KEY) return null;
  const reaches = (bars: { date: string }[]) => bars.length > 0 && (!since || bars[bars.length - 1].date <= since);
  const cached = seriesCache.get(ins.series);
  if (cached && Date.now() - cached.at < SERIES_TTL_MS && reaches(cached.data.bars)) return cached.data;
  let obs = await fredSeries(ins.series, 400); // ~1y of daily bars (or 400 months if monthly — far past any flag date)
  if (obs.length && !reaches(obs)) obs = await fredSeries(ins.series, 5000);
  if (!obs.length) return null;
  const data: DailySeries = { ticker: ins.label, bars: obs.map((o) => ({ date: o.date, close: o.value })) };
  seriesCache.set(ins.series, { at: Date.now(), data });
  return data;
}

// A $10K stake in this instrument at the flag-day level vs the latest level.
// Null for signal-only (non-investable) instruments — the direction would mislead.
export async function priceInstrumentRoi(ins: Instrument, since: string, invested: number): Promise<RoiPoint | null> {
  if (!ins.investable) return null;
  const series = await getInstrumentSeries(ins, since);
  return series ? computeRoi(series, since, invested) : null;
}

// Format a raw level for display — "78.20 $/bbl", "1.0850" (FX has no unit).
export function formatLevel(ins: Instrument, n: number): string {
  return `${fmtLevel(n, ins.decimals)}${ins.unit}`;
}
