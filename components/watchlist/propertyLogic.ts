// Pure helpers for the property pane — shapes of GET /api/property and the
// outlook stream, plus formatting. No React, no I/O, unit-tested.

import type { Tone } from "@/components/ui";
import { parseDebate } from "@/lib/parsers";

export interface MarketStats { latest: { date: string; close: number }; qoqPct: number | null; yoyPct: number | null; spark: number[] }
export interface Market { key: string; label: string; country: "SG" | "AU"; currency: string; unit: "index" | "price"; source: string; stats: MarketStats | null }
export interface Valuation { entryDate: string; entryLevel?: number; asOfDate: string; asOfLevel?: number; value: number; deltaPct: number }
export interface Holding { id: string; label: string; market_key: string; purchase_price: number; purchase_date: string; notes?: string; valuation: Valuation | null }
export interface Outlook {
  read: string; confirm: string; kill: string; stance: string;
  policy?: string; rates?: string; supply?: string; development?: string; sentiment?: string; rental?: string;
  scenarios?: string; longrun?: string; carry?: string;
  verdict?: string;
  drivers?: string; // legacy saved shape
}
export interface PropertyData {
  markets?: Market[];
  portfolio?: Holding[];
  outlooks?: Record<string, { body: Outlook; created_at: string }>;
}

export function money(n: number, ccy: string): string {
  if (!Number.isFinite(n)) return "—";
  return `${ccy ? `${ccy} ` : ""}${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function pct(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}%`;
}

/** The latest level as the source publishes it: a price in its currency, or a unitless index. */
export function marketLevel(m: Market): string | null {
  if (!m.stats) return null;
  return m.unit === "price" ? money(m.stats.latest.close, m.currency) : m.stats.latest.close.toFixed(1);
}

/** "2026-06-30" → "Q2 2026" — the indices are quarterly, so say so. */
export function quarterLabel(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})/);
  if (!m) return ymd;
  return `Q${Math.ceil(Number(m[2]) / 3)} ${m[1]}`;
}

/** Stance from the verdict's head word, falling back to the stored stance. */
export function outlookStance(o: Pick<Outlook, "verdict" | "stance">): { label: string; tone: Tone } {
  const head = (o.verdict || "").trim().toLowerCase();
  if (head.startsWith("buy")) return { label: "Constructive", tone: "pos" };
  if (head.startsWith("avoid") || head.startsWith("sell")) return { label: "Cautious", tone: "neg" };
  if (head.startsWith("hold")) return { label: "Mixed", tone: "warn" };
  switch (o.stance) {
    case "constructive": return { label: "Constructive", tone: "pos" };
    case "cautious": return { label: "Cautious", tone: "neg" };
    case "mixed": return { label: "Mixed", tone: "warn" };
    default: return { label: "Limited data", tone: "neutral" };
  }
}

/** Parse the (possibly partial) streamed outlook. Null until the READ section exists. */
export function toOutlook(raw: string): Outlook | null {
  const sec = parseDebate(raw);
  if (!sec.READ) return null;
  const head = (sec.VERDICT || "").trim().toLowerCase();
  const stance = head.startsWith("buy") ? "constructive" : head.startsWith("avoid") || head.startsWith("sell") ? "cautious" : "mixed";
  return {
    read: sec.READ, policy: sec.POLICY, rates: sec.RATES, supply: sec.SUPPLY, development: sec.DEVELOPMENT,
    sentiment: sec.SENTIMENT, rental: sec.RENTAL, scenarios: sec.SCENARIOS, longrun: sec.LONGRUN, carry: sec.CARRY,
    verdict: sec.VERDICT, confirm: sec.CONFIRM || "", kill: sec.KILL || "", stance,
  };
}

/** The drivers the outlook prompt covers, in reading order. */
export const OUTLOOK_DRIVERS: { key: "policy" | "rates" | "supply" | "development" | "sentiment" | "rental"; label: string }[] = [
  { key: "policy", label: "Policy" },
  { key: "rates", label: "Rates" },
  { key: "supply", label: "Supply" },
  { key: "development", label: "Development" },
  { key: "sentiment", label: "Sentiment" },
  { key: "rental", label: "Rentals" },
];

/** Today as YYYY-MM-DD (local) — the latest purchase date the form accepts. */
export function todayYmd(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Client-side mirror of the POST /api/property checks, so errors show inline before a round trip. */
export function validateProperty(f: { label: string; market_key: string; purchase_price: string; purchase_date: string }, today: string): Partial<Record<"label" | "market_key" | "purchase_price" | "purchase_date", string>> {
  const errs: Partial<Record<"label" | "market_key" | "purchase_price" | "purchase_date", string>> = {};
  if (!f.label.trim()) errs.label = "Give the property a name.";
  if (!f.market_key) errs.market_key = "Pick a market.";
  const price = Number(f.purchase_price.replace(/[,\s]/g, ""));
  if (!f.purchase_price.trim() || !Number.isFinite(price) || price <= 0 || price > 1e10) errs.purchase_price = "Enter the price you paid.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.purchase_date)) errs.purchase_date = "Enter the purchase date.";
  else if (f.purchase_date > today) errs.purchase_date = "The purchase date must be in the past.";
  return errs;
}
