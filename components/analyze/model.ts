// Presentation rules for the Analyze workspace — pure, so they're tested
// without rendering. Colours are always token references (var(--…)): the lens
// and persona hues in lib/lenses are the artifact's fixed hex values, which
// don't adapt to light/dark, so the screen maps keys to the theme's tokens.

import { LENSES, type LensKey, type StanceKey } from "@/lib/lenses";
import { toPoints, type Briefing } from "@/lib/parsers";
import type { Feature } from "@/lib/plans";
import type { Tone } from "@/components/ui";
import type { Call, ExtraKey, GapCode, LeanKey } from "@/lib/analysisStore";

export const lensVar = (key: LensKey): string => `var(--lens-${key.toLowerCase()})`;

export const STANCE_UI: Record<StanceKey, { label: string; tone: Tone; color: string }> = {
  constructive: { label: "Constructive", tone: "pos", color: "var(--pos)" },
  mixed: { label: "Mixed", tone: "warn", color: "var(--warn)" },
  cautious: { label: "Cautious", tone: "neg", color: "var(--neg)" },
  "limited-data": { label: "Limited data", tone: "neutral", color: "var(--text-3)" },
};

/** `label` follows lib/lenses overallLean; `short` fits a list row. */
export const LEAN_UI: Record<LeanKey, { label: string; short: string; tone: Tone }> = {
  constructive: { label: "Constructive lean", short: "Constructive", tone: "pos" },
  "tilts-constructive": { label: "Tilts constructive", short: "Tilts constructive", tone: "pos" },
  mixed: { label: "Mixed, no clear lean", short: "Mixed", tone: "warn" },
  "tilts-cautious": { label: "Tilts cautious", short: "Tilts cautious", tone: "neg" },
  cautious: { label: "Cautious lean", short: "Cautious", tone: "neg" },
};

export const CALL_TONE: Record<Call, Tone> = { Buy: "pos", Hold: "warn", Sell: "neg" };

/** Persona hues borrow the lens token closest to each discipline. */
export const PERSONA_VAR: Record<string, string> = {
  BUFFETT: "var(--lens-fundamental)",
  GRAHAM: "var(--lens-signals)",
  LYNCH: "var(--lens-technical)",
  BURRY: "var(--lens-macro)",
};

const stripMd = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^[*_\s]+|[*_\s]+$/g, "");

export interface VerdictParts {
  call: Call | null;
  /** The first line as written, for when it isn't a plain Buy/Hold/Sell. */
  headline: string;
  conviction: number | null;
  /** "12-mo estimates: …", "Entry thinking: …", "Wrong if: …" */
  details: { label: string; value: string }[];
  /** Lines that aren't label: value. */
  notes: string[];
}

export function verdictParts(verdict: string | null | undefined): VerdictParts {
  const lines = String(verdict ?? "").split("\n").map((l) => stripMd(l.trim())).filter(Boolean);
  const headline = lines[0] ?? "";
  const lower = headline.toLowerCase();
  const call: Call | null = lower.startsWith("buy") ? "Buy" : lower.startsWith("sell") ? "Sell" : lower.startsWith("hold") ? "Hold" : null;
  const c = Number(String(verdict ?? "").match(/conviction\s*(\d)\s*\/\s*5/i)?.[1]);
  const details: VerdictParts["details"] = [];
  const notes: string[] = [];
  for (const line of lines.slice(1)) {
    const m = line.match(/^([A-Za-z0-9][^:]{1,32}):\s*(.+)$/);
    if (m) details.push({ label: m[1].trim(), value: m[2].trim() });
    else notes.push(line);
  }
  return { call, headline, conviction: c >= 1 && c <= 5 ? c : null, details, notes };
}

/** Red-team verdicts: Proceed | Proceed smaller | Wait | Stay away. */
export function redteamTone(verdict: string | null | undefined): Tone {
  const v = stripMd(String(verdict ?? "")).toLowerCase();
  if (v.startsWith("proceed smaller") || v.startsWith("wait")) return "warn";
  if (v.startsWith("proceed")) return "pos";
  if (v.startsWith("stay away")) return "neg";
  return "neutral";
}

/** "1. Something" / "- Something" → "Something": the list renders its own markers. */
export function listPoints(text: string | null | undefined): string[] {
  return toPoints(String(text ?? "")).map((p) => p.replace(/^\d{1,2}[.)]\s+/, "").trim()).filter(Boolean);
}

/** "NAME (TICK) — 2nd degree — why" → lead "NAME (TICK)", rest "2nd degree — why". */
export function splitLead(point: string): { lead: string; rest: string } {
  const m = point.match(/^(.{2,80}?)\s+[—–-]\s+(.+)$/);
  return m ? { lead: stripMd(m[1]), rest: m[2] } : { lead: "", rest: point };
}

/** The lens read handed to chat, so "Ask" starts from what's on screen. */
export function chatNotes(b: Briefing | null): string | undefined {
  if (!b) return undefined;
  const leans = `Lens leans — ${LENSES.map((l) => `${l.name}: ${b.lenses[l.key]?.stance || "not returned"}`).join("; ")}`;
  return [b.SUMMARY && `Summary: ${b.SUMMARY}`, leans, b.VERDICT && `Verdict: ${b.VERDICT.split("\n")[0]}`, b.BOTTOMLINE && `Bottom line: ${b.BOTTOMLINE}`]
    .filter(Boolean).join("\n");
}

export const GAP_COPY: Record<GapCode, (query: string) => string> = {
  unmatched: (q) => `“${q}” couldn't be matched to a listed symbol, so nothing here is grounded in that company's own filings or price.`,
  no_price: () => "No current price or moving-average data could be retrieved.",
  no_fundamentals: () => "No SEC-filed fundamentals could be retrieved.",
};

export interface ToolInfo {
  key: ExtraKey;
  label: string;
  feature: Feature;
  /** What it is — shown on the locked card. */
  blurb: string;
  /** While it runs. */
  working: string;
  /** How to read the result. */
  note: string;
}

export const TOOLS: ToolInfo[] = [
  {
    key: "debate", label: "Bull vs Bear", feature: "debate",
    blurb: "The strongest case on each side, built from current sources, then judged: who wins right now, and what would flip it.",
    working: "Steelmanning both sides from current sources",
    note: "A convincing argument still isn't a guarantee — watch the flip condition.",
  },
  {
    key: "personas", label: "Investor takes", feature: "personas",
    blurb: "Four investing disciplines — quality, deep value, growth at a reasonable price and the contrarian — read the same name.",
    working: "Reading it through four investor disciplines",
    note: "Stylized disciplines, not the views of any real person. Unanimity either way is worth noticing.",
  },
  {
    key: "redteam", label: "Red team", feature: "redteam",
    blurb: "Ten specific ways this could lose you money, which of them are actually likely, and whether the idea survives the attack.",
    working: "Attacking the idea, worst case first",
    note: "The red team argues the downside on purpose — weigh it against the lens read.",
  },
  {
    key: "chain", label: "Chain map", feature: "chain",
    blurb: "The second- and third-degree winners and losers around this name — suppliers, adjacent industries and who gets disrupted.",
    working: "Mapping second- and third-degree winners and losers",
    note: "Chain names are one step removed — run the full lens read on any of them before acting.",
  },
];

export const TOOL_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t])) as Record<ExtraKey, ToolInfo>;
