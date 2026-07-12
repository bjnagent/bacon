// The overnight brain: assembles today's raw signals into one bundle and runs
// the synthesis pass that finds convergent, under-the-radar opportunities.
// Shared by the daily cron sweep and the on-demand /api/brief generator.

import { ask } from "./anthropic";
import { opportunityBriefPrompt } from "./prompts";
import { parseOpportunities, type OpportunityBrief } from "./parsers";
import type { Mover } from "./market";
import type { MacroIndicator } from "./macro";
import type { InsiderCluster } from "./insider";
import type { InstrumentQuote } from "./commodities";

export interface SignalBundle {
  movers: Mover[];
  losers?: Mover[];
  mostActive?: Mover[];
  sectors?: { sector: string; changePct: string }[];
  headlines: { head: string; source: string; why: string }[];
  macro: MacroIndicator[];
  themes: string[];
  tracked: string[];
  insiders?: InsiderCluster[];      // real Form 4 clusters via SEC EDGAR
  voices?: string[];                // public commentators the investor follows
  commodities?: InstrumentQuote[];  // real commodity levels via FRED
  fx?: InstrumentQuote[];           // real FX rates via FRED
  pulse?: string;                   // community pulse via Grok/X
  calibration?: string;             // the system's own graded track record memo
}

// Split the comma-separated settings.voices column into clean labels.
export function splitVoices(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 8);
}

export function buildSignalBundle(b: SignalBundle): string {
  const parts: string[] = [];
  if (b.movers.length) parts.push("REAL GAINERS TODAY (via market-data provider):\n" + b.movers.map((m) => `- ${m.ticker}: ${m.changePct}`).join("\n"));
  if (b.losers?.length) parts.push("REAL DECLINERS TODAY (contrarian / second-order clues):\n" + b.losers.map((m) => `- ${m.ticker}: ${m.changePct}`).join("\n"));
  if (b.mostActive?.length) parts.push("MOST ACTIVELY TRADED (attention flow):\n" + b.mostActive.map((m) => `- ${m.ticker}: ${m.changePct}`).join("\n"));
  if (b.sectors?.length) parts.push("SECTOR ROTATION (real-time performance):\n" + b.sectors.map((x) => `- ${x.sector}: ${x.changePct}`).join("\n"));
  if (b.commodities?.length) parts.push("REAL COMMODITY LEVELS (via FRED — spot/reference prices):\n" + b.commodities.map((q) => `- ${q.label}: ${q.value}${q.unit}${q.changePct ? ` (${q.changePct} vs prior)` : ""}`).join("\n"));
  if (b.fx?.length) parts.push("REAL FX RATES (via FRED):\n" + b.fx.map((q) => `- ${q.label}: ${q.value}${q.changePct ? ` (${q.changePct} vs prior)` : ""}`).join("\n"));
  if (b.headlines.length) parts.push("CURRENT HEADLINES (paraphrased, attributed):\n" + b.headlines.slice(0, 10).map((n) => `- ${n.head} (${n.source})${n.why ? " — " + n.why : ""}`).join("\n"));
  if (b.macro.length) parts.push("MACRO BACKDROP (real data via FRED):\n" + b.macro.map((m) => `- ${m.label}: ${m.value}${m.unit}${m.change != null ? ` (${m.change >= 0 ? "+" : ""}${m.change.toFixed(2)} vs prior)` : ""}`).join("\n"));
  if (b.insiders?.length) parts.push("INSIDER FILING CLUSTERS (real, from SEC EDGAR Form 4 filings over the last few trading days — clustered open-market BUYING is the notable signal; sampled counts, not totals):\n" + b.insiders.map((i) => `- ${i.company} (${i.ticker}): ${i.filings} filings; sampled filings show ${i.buys} open-market buy${i.buys === 1 ? "" : "s"}, ${i.sells} sale${i.sells === 1 ? "" : "s"}`).join("\n"));
  if (b.voices?.length) parts.push("TRACKED VOICES (public commentators the investor follows): " + b.voices.join(", "));
  if (b.pulse) parts.push("COMMUNITY PULSE (live X via Grok — noisy, contrarian at extremes; a HOT name is already crowded):\n" + b.pulse);
  if (b.calibration) parts.push("YOUR CALIBRATION (measured from your own graded past calls — correct for these biases):\n" + b.calibration);
  if (b.themes.length) parts.push("INVESTOR THEMES: " + b.themes.join("; "));
  if (b.tracked.length) parts.push("ALREADY TRACKED (prefer NEW names over these): " + b.tracked.join(", "));
  parts.push("Piece these signals together into today's opportunity brief.");
  return parts.join("\n\n");
}

export async function generateBrief(bundle: SignalBundle): Promise<OpportunityBrief> {
  const text = await ask(opportunityBriefPrompt(), [{ role: "user", content: buildSignalBundle(bundle) }], true, 1800, 6);
  return parseOpportunities(text);
}

// Track-record storage: one daily_briefs row per user per day. Items are the
// brief's opportunities; a later review pass appends outcome/verdict per item.
export interface StoredBriefItem {
  name: string; ticker: string; cls: string; horizon: string;
  thesis: string; signals: string; checks: string;
  action?: string; target?: string;   // the call: Buy/Accumulate/Watch + 12-mo est.
  outcome?: string; verdict?: string; // played-out | developing | faded | invalidated
}

export function briefToDailyRow(userId: string, brief: OpportunityBrief) {
  const items: StoredBriefItem[] = brief.items.map((o) => ({
    name: o.name, ticker: o.ticker, cls: o.cls, horizon: o.horizon,
    thesis: o.thesis, signals: o.signals, action: o.action, target: o.target,
    checks: [o.confirm && `Confirm: ${o.confirm}`, o.kill && `Kill: ${o.kill}`].filter(Boolean).join(" · "),
  }));
  return { user_id: userId, intro: brief.intro ?? "", caveat: brief.caveat ?? "", items };
}

// Storage mapping (zero-migration: rides the existing scout_picks table).
// kind='opportunity' rows carry items; one kind='brief-intro' row carries the
// intro + caveat so the cockpit can render the day's story.
export function briefToRows(userId: string, brief: OpportunityBrief) {
  const rows: Array<Record<string, unknown>> = brief.items.map((o) => ({
    user_id: userId,
    name: o.name,
    symbol: o.ticker,
    asset_class: o.cls,
    why: o.thesis,
    now_catalyst: o.signals,
    check_text: [o.confirm && `Confirm: ${o.confirm}`, o.kill && `Kill: ${o.kill}`].filter(Boolean).join(" · "),
    action: o.action || null,
    target: o.target || null,
    change_pct: null,
    data_source: o.horizon || null, // horizon rides the free-text source column
    kind: "opportunity",
  }));
  if (brief.intro || brief.caveat) {
    rows.push({ user_id: userId, name: "__brief__", symbol: "—", asset_class: "—", why: brief.intro ?? "", now_catalyst: "", check_text: brief.caveat ?? "", change_pct: null, data_source: null, kind: "brief-intro" });
  }
  return rows;
}
