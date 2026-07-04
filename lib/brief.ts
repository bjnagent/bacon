// The overnight brain: assembles today's raw signals into one bundle and runs
// the synthesis pass that finds convergent, under-the-radar opportunities.
// Shared by the daily cron sweep and the on-demand /api/brief generator.

import { ask } from "./anthropic";
import { opportunityBriefPrompt } from "./prompts";
import { parseOpportunities, type OpportunityBrief } from "./parsers";
import type { Mover } from "./market";
import type { MacroIndicator } from "./macro";

export interface SignalBundle {
  movers: Mover[];
  headlines: { head: string; source: string; why: string }[];
  macro: MacroIndicator[];
  themes: string[];
  tracked: string[];
}

export function buildSignalBundle(b: SignalBundle): string {
  const parts: string[] = [];
  if (b.movers.length) parts.push("REAL MOVERS TODAY (via market-data provider):\n" + b.movers.map((m) => `- ${m.ticker}: ${m.changePct}`).join("\n"));
  if (b.headlines.length) parts.push("CURRENT HEADLINES (paraphrased, attributed):\n" + b.headlines.slice(0, 10).map((n) => `- ${n.head} (${n.source})${n.why ? " — " + n.why : ""}`).join("\n"));
  if (b.macro.length) parts.push("MACRO BACKDROP (real data via FRED):\n" + b.macro.map((m) => `- ${m.label}: ${m.value}${m.unit}${m.change != null ? ` (${m.change >= 0 ? "+" : ""}${m.change.toFixed(2)} vs prior)` : ""}`).join("\n"));
  if (b.themes.length) parts.push("INVESTOR THEMES: " + b.themes.join("; "));
  if (b.tracked.length) parts.push("ALREADY TRACKED (prefer NEW names over these): " + b.tracked.join(", "));
  parts.push("Piece these signals together into today's opportunity brief.");
  return parts.join("\n\n");
}

export async function generateBrief(bundle: SignalBundle): Promise<OpportunityBrief> {
  const text = await ask(opportunityBriefPrompt(), [{ role: "user", content: buildSignalBundle(bundle) }], true, 1800);
  return parseOpportunities(text);
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
    change_pct: null,
    data_source: o.horizon || null, // horizon rides the free-text source column
    kind: "opportunity",
  }));
  if (brief.intro || brief.caveat) {
    rows.push({ user_id: userId, name: "__brief__", symbol: "—", asset_class: "—", why: brief.intro ?? "", now_catalyst: "", check_text: brief.caveat ?? "", change_pct: null, data_source: null, kind: "brief-intro" });
  }
  return rows;
}
