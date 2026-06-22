// Domain constants + helpers — ported faithfully from reference/bacon-artifact.jsx.
// The six lenses, asset classes, stances, frameworks, and the small pure helpers
// the UI and parsers rely on. Keep these in sync with the artifact.

export type LensKey = "FUNDAMENTAL" | "TECHNICAL" | "FACTOR" | "MACRO" | "SIGNALS" | "RISK";
export type StanceKey = "constructive" | "mixed" | "cautious" | "limited-data";

export interface Lens {
  key: LensKey;
  name: string;
  short: string;
  hue: string;
  blurb: string;
}

export const LENSES: Lens[] = [
  { key: "FUNDAMENTAL", name: "Fundamental", short: "FND", hue: "#E0A33E", blurb: "Value vs price — cash flows, multiples, moat." },
  { key: "TECHNICAL",   name: "Technical",   short: "TEC", hue: "#38B6C4", blurb: "Trend, momentum, volume, volatility." },
  { key: "FACTOR",      name: "Factor",      short: "FAC", hue: "#9B86E0", blurb: "Value, momentum, quality, size, low-vol." },
  { key: "MACRO",       name: "Macro / Reg", short: "MAC", hue: "#E2685C", blurb: "Rates, policy, regulation, supply chain." },
  { key: "SIGNALS",     name: "Smart-money", short: "FLW", hue: "#5FB97E", blurb: "Insider, 13F, COT, congressional, alt-data." },
  { key: "RISK",        name: "Risk",        short: "RSK", hue: "#6FA1CE", blurb: "What breaks the thesis, and sizing." },
];

export const ASSET_CLASSES = ["Equity / Stock", "ETF / Fund", "FX / Currency pair", "Crypto", "Commodity", "Bond / Rates"];
export const SUGGESTED_THEMES = ["AI infrastructure", "Defense & aerospace", "Energy transition", "GLP-1 / biotech", "EM carry (FX)", "Uranium & nuclear", "Semiconductors", "Gold & miners"];

export interface Stance {
  label: string;
  frac: number;
  tone: string;
}

export const STANCES: Record<StanceKey, Stance> = {
  "constructive": { label: "Constructive", frac: 1.0,  tone: "#4ED88A" },
  "mixed":        { label: "Mixed",        frac: 0.6,  tone: "#E6B24A" },
  "cautious":     { label: "Cautious",     frac: 0.32, tone: "#F0584B" },
  "limited-data": { label: "Limited data", frac: 0.16, tone: "#73837C" },
};

export function normStance(s: string | null | undefined): StanceKey {
  if (!s) return "mixed";
  const k = s.toLowerCase();
  if (k.includes("construct") || k.includes("bull") || k.includes("favor") || k.includes("positive")) return "constructive";
  if (k.includes("caution") || k.includes("bear") || k.includes("negativ") || k.includes("unfavor")) return "cautious";
  if (k.includes("limit") || k.includes("insufficient") || k.includes("unclear") || k.includes("n/a")) return "limited-data";
  return "mixed";
}

export function overallLean(stances: Partial<Record<LensKey, StanceKey>>): { label: string; tone: string } {
  const c = LENSES.filter((l) => stances[l.key] === "constructive").length;
  const x = LENSES.filter((l) => stances[l.key] === "cautious").length;
  if (c >= 3 && c > x) return { label: "Constructive lean", tone: STANCES.constructive.tone };
  if (x >= 3 && x > c) return { label: "Cautious lean", tone: STANCES.cautious.tone };
  if (c > x) return { label: "Tilts constructive", tone: STANCES.constructive.tone };
  if (x > c) return { label: "Tilts cautious", tone: STANCES.cautious.tone };
  return { label: "Mixed · no clear lean", tone: STANCES.mixed.tone };
}

export function mapClass(c: string | null | undefined): string {
  const k = (c || "").toLowerCase();
  if (k.includes("etf") || k.includes("fund")) return "ETF / Fund";
  if (k.includes("fx") || k.includes("curr")) return "FX / Currency pair";
  if (k.includes("crypto")) return "Crypto";
  if (k.includes("commod")) return "Commodity";
  if (k.includes("bond") || k.includes("rate")) return "Bond / Rates";
  return "Equity / Stock";
}

export function splitSymCls(s: string): { sym: string; cls: string } {
  let parts = s.trim().split(/\s+/);
  const hints: Record<string, string> = { fx: "FX / Currency pair", currency: "FX / Currency pair", etf: "ETF / Fund", fund: "ETF / Fund", crypto: "Crypto", commodity: "Commodity", commod: "Commodity", bond: "Bond / Rates", rates: "Bond / Rates", equity: "Equity / Stock", stock: "Equity / Stock" };
  let cls: string | null = null;
  const last = (parts[parts.length - 1] || "").toLowerCase();
  if (parts.length > 1 && hints[last]) { cls = hints[last]; parts = parts.slice(0, -1); }
  const sym = parts.join(" ");
  if (!cls) cls = sym.includes("/") ? "FX / Currency pair" : "Equity / Stock";
  return { sym: sym.toUpperCase(), cls };
}

export function relTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24); return d + "d ago";
}

export const PHILOSOPHY = "No serious desk relies on one method. They build a latticework — independent lenses that, when they agree, create conviction. Convergence across lenses is the signal; a single lens rarely is. And every public edge decays as it gets crowded, so process and risk control matter more than any one indicator.";

// Stylized investor disciplines (NOT impersonations of the real people) — a
// spread of philosophies to pressure-test an idea from different angles.
export interface Persona { key: string; name: string; lens: string; hue: string }
export const PERSONAS: Persona[] = [
  { key: "BUFFETT", name: "Buffett-style", lens: "Quality & moat, fair price", hue: "#E0A33E" },
  { key: "GRAHAM",  name: "Graham-style",  lens: "Deep value, margin of safety", hue: "#5FB97E" },
  { key: "LYNCH",   name: "Lynch-style",   lens: "Growth you understand (GARP)", hue: "#38B6C4" },
  { key: "BURRY",   name: "Burry-style",   lens: "Contrarian — what breaks it", hue: "#E2685C" },
];

export interface Framework {
  key: LensKey;
  name: string;
  hue: string;
  summary: string;
  playbook: { h: string; p: string }[];
  terms: string[];
  caveat: string;
}

export const FRAMEWORKS: Framework[] = [
  { key: "FUNDAMENTAL", name: "Fundamental", hue: "#E0A33E", summary: "Estimate what a business is worth, then compare to price.",
    playbook: [
      { h: "Understand the engine first", p: "Before any number: how does it make money, which segments carry the margin, what's the moat, who runs it. Read the 10-K business section and MD&A." },
      { h: "Discounted cash flow (DCF)", p: "Present value of future free cash flows discounted at WACC. Powerful but sensitive to growth and discount-rate assumptions — stress-test them." },
      { h: "Multiples as a cross-check", p: "Trailing vs forward P/E, P/B, PEG, EV/EBITDA. Compare to the company's own 5-year history and to peers, never in isolation." },
      { h: "Quality & solvency", p: "ROE, gross/operating margins, debt-to-equity, free-cash-flow conversion. Strong balance sheets defend in downturns." },
      { h: "Triangulate, don't trust one", p: "Pros average several independent value estimates rather than betting on a single output." },
    ], terms: ["DCF", "WACC", "P/E (trailing & forward)", "PEG", "ROE", "Free cash flow", "Moat"],
    caveat: "Fundamentals win long-term, but markets can stay irrational far longer than expected. Valuation tells you what, not when." },
  { key: "FACTOR", name: "Factor / Quant", hue: "#9B86E0", summary: "Tilt systematically toward persistent, rules-based return drivers.",
    playbook: [
      { h: "Value", p: "Cheap on P/E, P/B or P/CF. ~2–4% annualized historical premium; lags hard in growth-led bull runs." },
      { h: "Momentum", p: "Recent winners (≈3–12 months) tend to keep winning near-term. Strong in trends, prone to sharp reversals." },
      { h: "Quality", p: "High profitability, low leverage, stable earnings. Defensive — shines when growth decelerates." },
      { h: "Size & Low-volatility", p: "Small-caps carry a regime-dependent premium; low-vol stocks have beaten on a risk-adjusted basis." },
      { h: "Blend, don't time", p: "Factors are cyclical and lowly correlated to each other. Combine and rebalance; timing one factor is very hard." },
    ], terms: ["Value", "Momentum", "Quality", "Size", "Low-volatility", "Multi-factor", "Smart beta"],
    caveat: "Any single factor can underperform for years. Crowding into popular factor ETFs can compress the premium." },
  { key: "TECHNICAL", name: "Technical", hue: "#38B6C4", summary: "Read price, momentum and participation for timing and crowd behavior.",
    playbook: [
      { h: "Trend (moving averages)", p: "Price above the 50/200-day = uptrend bias; below = downtrend. The crossover marks regime shifts. Lagging by design." },
      { h: "Momentum (RSI, MACD, Stochastic)", p: "RSI >70 overbought / <30 oversold; MACD 12/26/9 crossovers; watch divergences where price and momentum disagree." },
      { h: "Volume (OBV, VWAP)", p: "Is the move backed by participation? Volume confirms whether institutional flow supports a breakout." },
      { h: "Volatility (Bollinger, ATR)", p: "Bollinger 20±2σ frames over-extension; ATR sizes stops to current volatility, not a fixed number." },
      { h: "Confluence over clutter", p: "Use 2–4 complementary indicators (one per family) and seek agreement across timeframes." },
    ], terms: ["50/200-day MA", "RSI (14)", "MACD (12/26/9)", "OBV / VWAP", "Bollinger Bands", "ATR", "Divergence"],
    caveat: "No indicator predicts. They confirm or contradict a thesis. Over-fitting to history produces setups that fail live." },
  { key: "MACRO", name: "FX / Macro / Regulatory", hue: "#E2685C", summary: "Currencies and rate-sensitive assets trade on relative macro and policy.",
    playbook: [
      { h: "Carry trade", p: "Borrow a low-yield currency, hold a higher-yield one, earn the differential. Works in calm, risk-on regimes." },
      { h: "Rate differentials & policy divergence", p: "The gap between two central banks' paths sets the bias. But markets price expectations ahead — forwards show what's in." },
      { h: "Valuation overlay (PPP)", p: "High carry on an overvalued currency is a warning of downside skew, not free yield." },
      { h: "Regulatory & policy catalysts", p: "Legislation, tariffs, antitrust, approvals and subsidies move whole sectors. Track agendas and rule-making calendars." },
      { h: "Supply chain & commodities", p: "Upstream input costs and downstream demand, shipping/inventory flows, and weather drive real cash flows." },
    ], terms: ["Carry trade", "Rate differential", "Covered interest parity", "PPP / fair value", "Policy divergence", "Forward points"],
    caveat: "Carry doesn't fail slowly — a risk-off shock can unwind months of gains in hours. Cap single positions tightly." },
  { key: "SIGNALS", name: "Smart-money & Alt-data", hue: "#5FB97E", summary: "Independent evidence of what's happening before it hits the filings.",
    playbook: [
      { h: "Insider buys (SEC Form 4)", p: "Free on EDGAR within ~2 business days. Executives buying with personal money is among the cleanest bullish tells." },
      { h: "13F & whale convergence", p: "Quarterly institutional holdings (free on EDGAR). Several respected funds buying the same name matters more than one." },
      { h: "13D/G, COT & congressional trades", p: "Activist stakes, CFTC weekly futures positioning, and committee-aligned lawmaker buys as policy-momentum signals." },
      { h: "Paid alt-data (institutional)", p: "Satellite/foot-traffic, credit-card panels, job-posting velocity — bought for lead time. Costly and increasingly crowded." },
      { h: "Government contracts & lobbying", p: "Public award and lobbying databases reveal demand and regulatory positioning before guidance catches up." },
    ], terms: ["SEC EDGAR", "Form 4", "13F", "13D/13G", "COT report", "Congressional trades", "Channel checks"],
    caveat: "Data informs, it never decides. Any edge that becomes public gets crowded — value migrates to how you combine signals." },
  { key: "RISK", name: "Risk & Position Sizing", hue: "#6FA1CE", summary: "Survival first. Sizing and correlation control outcomes more than entries.",
    playbook: [
      { h: "Fixed-fractional risk", p: "Risk a small fixed % per position (often 0.5–2%), sized from entry-to-stop distance. What most desks use day to day." },
      { h: "Kelly as a ceiling", p: "f* = (bp − q)/b is growth-optimal but over-bets brutally. Use ½- or ¼-Kelly; treat full Kelly as a hard upper bound." },
      { h: "Correlation is the hidden risk", p: "Sizing correlated positions each at Kelly creates concealed concentration. Apply a portfolio-wide risk budget." },
      { h: "Drawdown discipline", p: "Define max drawdown and per-trade loss limits in advance. A string of losses at aggressive size is ruinous." },
      { h: "Costs, taxes, slippage", p: "Spreads, commissions, financing and taxes quietly erode edge. A strategy must clear these before it's worth running." },
    ], terms: ["Fixed-fractional", "Kelly criterion", "Fractional Kelly", "Risk budget", "Max drawdown", "Correlation"],
    caveat: "The edge that matters most is not blowing up. Most edges are small and decay; risk control is what compounds." },
];
