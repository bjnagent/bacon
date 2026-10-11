// Pure helpers for the Watchlist tab — no React, no I/O, unit-tested.

import type { Tone } from "@/components/ui";
import type { WatchRow } from "@/lib/types";

/** A shell watchlist item plus whatever detail columns the row carries. */
export type NameRow = { id: string; symbol: string; asset_class: string } & Partial<Omit<WatchRow, "id" | "symbol" | "asset_class">>;

/** /api/quotes entry (lib/quotes Quote) — redeclared so the client never imports server code. */
export interface Quote {
  symbol: string;
  price: number;
  changePct: number | null;
  at: string;
  live: boolean;
  source: string;
}

// ---- lean -----------------------------------------------------------------

/** The overnight read's stance as a badge. No read yet is "Pending", never a guess. */
export function leanBadge(lean: string | null | undefined): { label: string; tone: Tone } {
  switch (lean) {
    case "constructive": return { label: "Constructive", tone: "pos" };
    case "mixed": return { label: "Mixed", tone: "warn" };
    case "cautious": return { label: "Cautious", tone: "neg" };
    case "limited-data": return { label: "Limited data", tone: "neutral" };
    default: return { label: "Pending", tone: "neutral" };
  }
}

export const CONVICTION_LABELS = ["Not set", "Watching", "Tentative", "Building", "Strong", "High"];

// ---- asset classes ----------------------------------------------------------

/** The stored asset-class strings (lib/lenses ASSET_CLASSES) with short labels. */
export const CLASS_OPTIONS: { value: string; label: string }[] = [
  { value: "Equity / Stock", label: "Stock" },
  { value: "ETF / Fund", label: "ETF" },
  { value: "Crypto", label: "Crypto" },
  { value: "FX / Currency pair", label: "FX" },
  { value: "Commodity", label: "Commodity" },
  { value: "Bond / Rates", label: "Bonds" },
];

export function classShort(cls: string | null | undefined): string {
  return CLASS_OPTIONS.find((o) => o.value === cls)?.label ?? (cls || "Stock");
}

const CRYPTO = new Set(["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK", "LTC", "BCH", "MATIC", "ATOM", "UNI", "XLM", "SHIB", "TRX", "TON", "NEAR", "APT", "ARB", "OP", "SUI"]);
const ETFS = new Set(["SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "VT", "VEA", "VWO", "EEM", "EFA", "TLT", "IEF", "SHY", "HYG", "LQD", "GLD", "SLV", "USO", "UNG", "SMH", "SOXX", "XLE", "XLF", "XLK", "XLV", "XLI", "XLU", "ARKK", "IBIT", "URA", "GDX", "KWEB", "FXI", "EWJ", "EWS", "EWA"]);
const COMMODITIES = new Set(["GOLD", "SILVER", "OIL", "WTI", "BRENT", "COPPER", "NATGAS", "URANIUM", "HG", "GC", "SI", "CL", "NG", "XAU", "XAG", "WHEAT", "CORN"]);
const FIAT = new Set(["USD", "EUR", "JPY", "GBP", "AUD", "NZD", "CAD", "CHF", "SGD", "HKD", "CNY", "CNH", "SEK", "NOK", "MXN", "INR", "KRW", "ZAR", "BRL", "TRY"]);

/**
 * Best guess at the asset class from what was typed, so the common case needs
 * no extra tap. The member can always override it before tracking.
 */
export function guessClass(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "Equity / Stock";
  const pair = s.match(/^([A-Z]{2,6})[/-]([A-Z]{3,4})$/);
  if (pair) {
    if (CRYPTO.has(pair[1])) return "Crypto";
    if (FIAT.has(pair[1]) && FIAT.has(pair[2])) return "FX / Currency pair";
  }
  if (CRYPTO.has(s)) return "Crypto";
  if (ETFS.has(s)) return "ETF / Fund";
  if (COMMODITIES.has(s)) return "Commodity";
  if (/^(US)?(2|5|10|30)Y$/.test(s)) return "Bond / Rates";
  return "Equity / Stock";
}

/** One-tap starters for an empty watchlist. Symbols only — no figures. */
export const POPULAR: { symbol: string; cls: string }[] = [
  { symbol: "NVDA", cls: "Equity / Stock" },
  { symbol: "AAPL", cls: "Equity / Stock" },
  { symbol: "MSFT", cls: "Equity / Stock" },
  { symbol: "AMZN", cls: "Equity / Stock" },
  { symbol: "TSLA", cls: "Equity / Stock" },
  { symbol: "SPY", cls: "ETF / Fund" },
  { symbol: "GLD", cls: "ETF / Fund" },
  { symbol: "BTC", cls: "Crypto" },
  { symbol: "ETH", cls: "Crypto" },
];

// ---- quotes -----------------------------------------------------------------

/**
 * The symbol to ask /api/quotes for, or null when no honest quote exists for
 * this kind of instrument. Crypto goes to the live exchange as a BASE-USD pair;
 * stocks and ETFs get the delayed close. FX, commodities and rates are left
 * out: the quote provider would read "EUR/USD" as the ticker "EUR", and a
 * wrong price is worse than none. The returned form matches the key the server
 * answers under (lib/market cleanTicker), so lookups line up.
 */
export function quoteKey(symbol: string, cls: string | null | undefined): string | null {
  const s = symbol.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  if (cls === "Crypto") {
    const pair = s.match(/^([A-Z]{2,6})[/-](USD|USDT|USDC|EUR|GBP)$/);
    if (pair) return `${pair[1]}-${pair[2]}`;
    return /^[A-Z]{2,6}$/.test(s) ? `${s}-USD` : null;
  }
  if (cls === "Equity / Stock" || cls === "ETF / Fund" || !cls) {
    // Root plus an optional exchange suffix (BRK.B, D05.SI, 0700.HK).
    if (/^[A-Z][A-Z0-9]{0,9}(\.[A-Z]{1,3})?$/.test(s)) return s;
    if (/^[0-9]{1,6}\.[A-Z]{1,3}$/.test(s)) return s;
  }
  return null;
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Price without a currency sign: the provider doesn't say which currency. */
export function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

/** "close" or "live" — the one-word staleness label every quote carries. */
export function quoteLabel(q: Quote): string {
  return q.live ? "Live" : "Close";
}

/** Follows the label in the detail view: from where, and as of when. */
export function quoteDetail(q: Quote): string {
  if (q.live) return `via ${q.source}${q.changePct != null ? " · 24h change" : ""}`;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(q.at) ? formatDay(q.at) : null;
  return `${d ? `as of ${d} · ` : ""}delayed, not live`;
}

/** "2026-10-09" → "9 Oct 2026" without timezone drift. */
export function formatDay(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

// ---- scout picks ------------------------------------------------------------

/** "+8.2%" / "8.2" / "▲ 8.2 %" → 8.2. Null when there is no number to show. */
export function parseMovePct(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, "").match(/([+\-−]?)\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  return m[1] === "-" || m[1] === "−" || /▼/.test(raw) ? -n : n;
}

/** The symbol to track/analyze for a pick: its ticker, or its name when none. */
export function pickSymbol(ticker: string | null | undefined, name: string): string {
  const t = (ticker || "").trim();
  return t && t !== "—" ? t : name.trim();
}

// ---- freshness --------------------------------------------------------------

/** Data older than this is refreshed quietly when the tab comes back on screen. */
export const STALE_MS = 5 * 60_000;

export function isStale(lastAt: number, now: number, ms = STALE_MS): boolean {
  return lastAt > 0 && now - lastAt > ms;
}

/** "5 names" / "1 name". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
