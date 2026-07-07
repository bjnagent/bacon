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
  if (k.includes("cautio") || k.includes("bear") || k.includes("negativ") || k.includes("unfavor")) return "cautious";
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

// Stylized investor disciplines (NOT impersonations of the real people) — a
// spread of philosophies to pressure-test an idea from different angles.
export interface Persona { key: string; name: string; lens: string; hue: string }
export const PERSONAS: Persona[] = [
  { key: "BUFFETT", name: "Buffett-style", lens: "Quality & moat, fair price", hue: "#E0A33E" },
  { key: "GRAHAM",  name: "Graham-style",  lens: "Deep value, margin of safety", hue: "#5FB97E" },
  { key: "LYNCH",   name: "Lynch-style",   lens: "Growth you understand (GARP)", hue: "#38B6C4" },
  { key: "BURRY",   name: "Burry-style",   lens: "Contrarian — what breaks it", hue: "#E2685C" },
];

