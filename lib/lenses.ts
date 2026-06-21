// LENSES, STANCES, ASSET_CLASSES, FRAMEWORKS — ported from bacon-artifact.jsx
// TODO: copy verbatim from reference artifact once bacon-artifact.jsx is committed

export const LENSES = [
  { key: "fundamental",  label: "Fundamental",         hue: "#4B8B6A" },
  { key: "technical",    label: "Technical",           hue: "#5B7BB2" },
  { key: "factor",      label: "Factor",              hue: "#7B5BA2" },
  { key: "macro",       label: "Macro / Regulatory",  hue: "#B27B4B" },
  { key: "smart_money",  label: "Smart Money / Signals", hue: "#4BA07B" },
  { key: "risk",        label: "Risk",                hue: "#B25B5B" },
] as const;

export const STANCES = ["bullish", "bearish", "neutral", "mixed"] as const;
export type Stance = typeof STANCES[number];

export const ASSET_CLASSES = [
  "Equity / Stock",
  "ETF / Fund",
  "Fixed Income / Bond",
  "Commodity",
  "FX / Currency",
  "Crypto / Digital Asset",
  "Real Estate",
  "Derivatives / Options",
] as const;

export const FRAMEWORKS = [
  "Porter's Five Forces",
  "Moat Analysis",
  "DCF Valuation",
  "Comparable Analysis",
  "Industry Lifecycle",
  "Regulatory Impact Assessment",
  "Crowd / Sentiment",
  "Risk/Reward Ratio",
  "Position Size / Kelly Criterion",
] as const;
