// Real company fundamentals from SEC EDGAR XBRL (free, official, keyless) — the
// same primary-source ethos as lib/insider.ts and lib/macro.ts. This is the
// accuracy foundation: the FUNDAMENTAL and VALUATION lenses are the most
// number-heavy, and web-search alone is the highest hallucination surface for
// exactly those numbers. Here we hand the model the ACTUAL FILED figures
// (revenue, margins, EPS, shares) so it reasons over ground truth, and derive a
// real market cap / P/E / PEG from those + the live price — never invented.
//
// US filers only (EDGAR is US). A non-US ticker, an unmatched symbol, or any
// fetch failure returns null, and the lens degrades to web-search exactly as
// before — so this only ever ADDS accuracy, never breaks a read.

export const FUNDAMENTALS_SOURCE = "SEC EDGAR (XBRL company facts)";

const SEC_HEADERS = {
  // SEC fair-use asks requesters to identify themselves (same as lib/insider.ts).
  "User-Agent": `bacon-research-app/1.0 (${process.env.SEC_CONTACT_EMAIL || "contact@bacon.app"})`,
};

// ---------- XBRL shapes ----------

// One observation in a companyconcept response. Duration concepts (revenue) carry
// `start`+`end`; instant concepts (assets, shares) carry only `end`.
export interface XbrlPoint {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;   // FY | Q1 | Q2 | Q3
  form?: string; // 10-K | 10-Q | ...
}

export interface Fundamentals {
  ticker: string;
  cik: string;
  fiscalYear: number | null;      // FY the flow figures are from
  asOf: string | null;            // latest balance-sheet date
  revenue: number | null;
  revenuePrior: number | null;
  revenueGrowthPct: number | null;
  netIncome: number | null;
  netIncomePrior: number | null;
  earningsGrowthPct: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  netMarginPct: number | null;
  epsDiluted: number | null;      // latest FY diluted EPS
  sharesOutstanding: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  debtToEquity: number | null;
}

export interface Valuation {
  price: number;
  marketCap: number | null;
  peTrailing: number | null;
  pegRatio: number | null;        // P/E ÷ growth% (earnings growth, revenue fallback)
  pegBasis: "earnings" | "revenue" | null;
}

// ---------- pure helpers (unit-tested) ----------

const DAY = 86_400_000;
const isFullYear = (p: XbrlPoint): boolean => {
  if (!p.start) return false;
  const days = (new Date(p.end).getTime() - new Date(p.start).getTime()) / DAY;
  return days >= 330 && days <= 400;
};

// Latest two distinct fiscal years of an ANNUAL flow concept (revenue, net
// income, EPS…), newest first. Restricts to full-year windows from annual
// filings so a quarter is never mistaken for a year; dedupes by fiscal year.
export function annualSeries(points: XbrlPoint[] | undefined): { fy: number; end: string; val: number }[] {
  if (!Array.isArray(points)) return [];
  const byFy = new Map<string, { fy: number; end: string; val: number; i: number }>();
  points.forEach((p, i) => {
    if (!(Number.isFinite(p.val) && isFullYear(p) && (p.fp === "FY" || (p.form || "").startsWith("10-K")))) return;
    const key = p.fy != null ? String(p.fy) : p.end.slice(0, 4);
    const prev = byFy.get(key);
    // Per fiscal year keep the latest period-end; on an identical end (a
    // restatement/amendment) keep the one filed later — i.e. later in the array.
    if (!prev || p.end > prev.end || (p.end === prev.end && i > prev.i)) {
      byFy.set(key, { fy: p.fy ?? Number(p.end.slice(0, 4)), end: p.end, val: p.val, i });
    }
  });
  return [...byFy.values()]
    .map(({ fy, end, val }) => ({ fy, end, val }))
    .sort((a, b) => (a.end < b.end ? 1 : -1));
}

// Latest point-in-time value of an INSTANT concept (assets, shares…).
export function latestInstant(points: XbrlPoint[] | undefined): { end: string; val: number } | null {
  if (!Array.isArray(points)) return null;
  const instants = points
    .filter((p) => Number.isFinite(p.val) && !p.start)
    .sort((a, b) => (a.end < b.end ? 1 : -1));
  return instants.length ? { end: instants[0].end, val: instants[0].val } : null;
}

const growthPct = (latest: number | null, prior: number | null): number | null =>
  latest != null && prior != null && prior !== 0 ? ((latest - prior) / Math.abs(prior)) * 100 : null;

const marginPct = (part: number | null, whole: number | null): number | null =>
  part != null && whole != null && whole !== 0 ? (part / whole) * 100 : null;

// Derive the price-dependent valuation from filed fundamentals + a live close.
// Pure so it's unit-tested; the route supplies the price it already fetched.
export function deriveValuation(f: Fundamentals, price: number): Valuation | null {
  if (!(price > 0)) return null;
  const marketCap = f.sharesOutstanding && f.sharesOutstanding > 0 ? price * f.sharesOutstanding : null;
  const peTrailing = f.epsDiluted && f.epsDiluted > 0 ? price / f.epsDiluted : null;
  // PEG needs a positive growth rate; prefer earnings growth, fall back to revenue.
  let pegBasis: Valuation["pegBasis"] = null;
  let growth: number | null = null;
  if (f.earningsGrowthPct != null && f.earningsGrowthPct > 0) { growth = f.earningsGrowthPct; pegBasis = "earnings"; }
  else if (f.revenueGrowthPct != null && f.revenueGrowthPct > 0) { growth = f.revenueGrowthPct; pegBasis = "revenue"; }
  const pegRatio = peTrailing != null && growth != null && growth > 0 ? peTrailing / growth : null;
  return { price, marketCap, peTrailing, pegRatio, pegBasis: pegRatio != null ? pegBasis : null };
}

// Assemble a Fundamentals object from the raw concept point-arrays. Kept pure and
// separate from fetching so it's fully unit-testable with fixture JSON.
export function assembleFundamentals(
  ticker: string,
  cik: string,
  concepts: {
    revenue?: XbrlPoint[]; netIncome?: XbrlPoint[]; grossProfit?: XbrlPoint[]; operatingIncome?: XbrlPoint[];
    eps?: XbrlPoint[]; shares?: XbrlPoint[]; assets?: XbrlPoint[]; liabilities?: XbrlPoint[]; equity?: XbrlPoint[];
  }
): Fundamentals | null {
  const rev = annualSeries(concepts.revenue);
  const ni = annualSeries(concepts.netIncome);
  const gp = annualSeries(concepts.grossProfit);
  const oi = annualSeries(concepts.operatingIncome);
  const eps = annualSeries(concepts.eps);
  const shares = latestInstant(concepts.shares);
  const assets = latestInstant(concepts.assets);
  const liabilities = latestInstant(concepts.liabilities);
  const equity = latestInstant(concepts.equity);

  // Need at least one hard flow figure to be worth grounding; else let search handle it.
  if (!rev.length && !ni.length && !eps.length) return null;

  const revenue = rev[0]?.val ?? null;
  const revenuePrior = rev[1]?.val ?? null;
  const netIncome = ni[0]?.val ?? null;
  const netIncomePrior = ni[1]?.val ?? null;
  const fiscalYear = rev[0]?.fy ?? ni[0]?.fy ?? eps[0]?.fy ?? null;

  // Align gross/operating profit to the same fiscal year as revenue when possible.
  const grossSameFy = gp.find((g) => g.fy === fiscalYear)?.val ?? gp[0]?.val ?? null;
  const opSameFy = oi.find((o) => o.fy === fiscalYear)?.val ?? oi[0]?.val ?? null;

  return {
    ticker, cik,
    fiscalYear,
    asOf: assets?.end ?? shares?.end ?? null,
    revenue, revenuePrior,
    revenueGrowthPct: growthPct(revenue, revenuePrior),
    netIncome, netIncomePrior,
    earningsGrowthPct: growthPct(netIncome, netIncomePrior),
    grossMarginPct: marginPct(grossSameFy, revenue),
    operatingMarginPct: marginPct(opSameFy, revenue),
    netMarginPct: marginPct(netIncome, revenue),
    epsDiluted: eps[0]?.val ?? null,
    sharesOutstanding: shares?.val ?? null,
    assets: assets?.val ?? null,
    liabilities: liabilities?.val ?? null,
    equity: equity?.val ?? null,
    debtToEquity: liabilities && equity && equity.val !== 0 ? liabilities.val / equity.val : null,
  };
}

// Compact human-readable amounts for the prompt (real figures only).
function money(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}
const pct1 = (n: number | null): string | null => (n == null || !Number.isFinite(n) ? null : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

// Build the prompt-injection block. Only real, filed/derived figures appear; a
// missing metric is simply omitted (never guessed). Returns "" if nothing usable.
export function formatFundamentals(f: Fundamentals, v: Valuation | null): string {
  const rows: string[] = [];
  const fyLabel = f.fiscalYear ? `FY${f.fiscalYear}` : "latest FY";
  if (f.revenue != null) rows.push(`- Revenue (${fyLabel}): ${money(f.revenue)}${f.revenueGrowthPct != null ? ` (${pct1(f.revenueGrowthPct)} YoY)` : ""}`);
  if (f.netIncome != null) rows.push(`- Net income (${fyLabel}): ${money(f.netIncome)}${f.earningsGrowthPct != null ? ` (${pct1(f.earningsGrowthPct)} YoY)` : ""}`);
  if (f.grossMarginPct != null) rows.push(`- Gross margin: ${f.grossMarginPct.toFixed(1)}%`);
  if (f.operatingMarginPct != null) rows.push(`- Operating margin: ${f.operatingMarginPct.toFixed(1)}%`);
  if (f.netMarginPct != null) rows.push(`- Net margin: ${f.netMarginPct.toFixed(1)}%`);
  if (f.epsDiluted != null) rows.push(`- Diluted EPS (${fyLabel}): $${f.epsDiluted.toFixed(2)}`);
  if (f.debtToEquity != null) rows.push(`- Liabilities/equity: ${f.debtToEquity.toFixed(2)}×`);
  if (v?.marketCap != null) rows.push(`- Market cap (live price × shares): ${money(v.marketCap)}`);
  if (v?.peTrailing != null) rows.push(`- Trailing P/E (live price ÷ EPS): ${v.peTrailing.toFixed(1)}×`);
  if (v?.pegRatio != null) rows.push(`- PEG (P/E ÷ ${v.pegBasis} growth): ${v.pegRatio.toFixed(2)}`);
  if (!rows.length) return "";
  return `\n\nREAL FUNDAMENTALS for the FUNDAMENTAL & VALUATION lenses — from SEC EDGAR XBRL filings${f.asOf ? ` (balance sheet as of ${f.asOf})` : ""}, market ratios from the live price. These are FILED figures: use THEM, do not substitute web-searched estimates, and do not invent alternatives:\n${rows.join("\n")}`;
}

// ---------- fetching ----------

const UA_TIMEOUT_MS = 5000;
async function secJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: SEC_HEADERS, cache: "no-store", signal: AbortSignal.timeout(UA_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

// ticker → zero-padded 10-digit CIK, from SEC's master mapping (cached ~24h).
let tickerMap: { at: number; map: Map<string, string> } | null = null;
const MAP_TTL_MS = 24 * 60 * 60 * 1000;

export async function cikForTicker(rawTicker: string): Promise<string | null> {
  const t = rawTicker.trim().toUpperCase();
  if (!t) return null;
  if (!tickerMap || Date.now() - tickerMap.at > MAP_TTL_MS) {
    const data = await secJson<Record<string, { cik_str: number; ticker: string }>>("https://www.sec.gov/files/company_tickers.json");
    if (!data) return tickerMap?.map.get(t) ?? tickerMap?.map.get(t.replace(/\./g, "-")) ?? null;
    const map = new Map<string, string>();
    for (const row of Object.values(data)) {
      if (row?.ticker && row.cik_str != null) map.set(String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, "0"));
    }
    tickerMap = { at: Date.now(), map };
  }
  return tickerMap.map.get(t) ?? tickerMap.map.get(t.replace(/\./g, "-")) ?? null;
}

// Pull one us-gaap (or dei) concept's observations, trying tag fallbacks in order.
interface ConceptResponse { units?: Record<string, XbrlPoint[]> }
async function concept(cik: string, tags: string[], unit: string, taxonomy = "us-gaap"): Promise<XbrlPoint[] | undefined> {
  for (const tag of tags) {
    const data = await secJson<ConceptResponse>(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/${taxonomy}/${tag}.json`);
    const points = data?.units?.[unit];
    if (Array.isArray(points) && points.length) return points;
  }
  return undefined;
}

const fundCache = new Map<string, { at: number; data: Fundamentals | null }>();
const FUND_TTL_MS = 12 * 60 * 60 * 1000; // fundamentals change quarterly

// Real fundamentals for a US-listed ticker, or null (non-US / unmatched / failure
// → the lens falls back to web search). Concept fetches run in parallel.
export async function getFundamentals(rawTicker: string): Promise<Fundamentals | null> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) return null;
  const cached = fundCache.get(ticker);
  if (cached && Date.now() - cached.at < FUND_TTL_MS) return cached.data;

  const cik = await cikForTicker(ticker);
  if (!cik) { fundCache.set(ticker, { at: Date.now(), data: null }); return null; }

  const [revenue, netIncome, grossProfit, operatingIncome, eps, shares, assets, liabilities, equity] = await Promise.all([
    concept(cik, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], "USD"),
    concept(cik, ["NetIncomeLoss"], "USD"),
    concept(cik, ["GrossProfit"], "USD"),
    concept(cik, ["OperatingIncomeLoss"], "USD"),
    concept(cik, ["EarningsPerShareDiluted"], "USD/shares"),
    concept(cik, ["EntityCommonStockSharesOutstanding"], "shares", "dei"),
    concept(cik, ["Assets"], "USD"),
    concept(cik, ["Liabilities"], "USD"),
    concept(cik, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], "USD"),
  ]);

  const data = assembleFundamentals(ticker, cik, { revenue, netIncome, grossProfit, operatingIncome, eps, shares, assets, liabilities, equity });
  fundCache.set(ticker, { at: Date.now(), data });
  return data;
}
