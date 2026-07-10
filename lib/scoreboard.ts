// All-time track-record scoreboard — the headline the honesty loop was missing:
// across every priced brief, what would the hypothetical $10K-per-idea baskets be
// worth now, and how often did the calls actually play out? Pure aggregation over
// the stored per-day ROI snapshots + the review verdicts, so no re-pricing.

export interface DayTotals { invested: number; value: number; roiPct: number; count?: number }
export interface ScoreItem { verdict?: string }
export interface ScoreBrief { id: string; items: ScoreItem[]; roi?: DayTotals | null }

export interface Scoreboard {
  pricedDays: number;
  invested: number;
  value: number;
  roiPct: number;
  wins: number;      // verdict "played-out"
  losses: number;    // verdict "faded" | "invalidated"
  graded: number;    // wins + losses
  hitRatePct: number | null;
}

// `live` lets a freshly-priced day (in the UI, not yet reloaded) override its
// stored snapshot so the scoreboard reflects the latest re-price immediately.
export function computeScoreboard(briefs: ScoreBrief[], live: Record<string, DayTotals | undefined> = {}): Scoreboard {
  let invested = 0, value = 0, pricedDays = 0;
  for (const b of briefs) {
    const t = live[b.id] ?? b.roi;
    if (t && t.invested > 0) { invested += t.invested; value += t.value; pricedDays++; }
  }
  let wins = 0, losses = 0;
  for (const b of briefs) for (const it of b.items) {
    if (it.verdict === "played-out") wins++;
    else if (it.verdict === "invalidated" || it.verdict === "faded") losses++;
  }
  const graded = wins + losses;
  return {
    pricedDays,
    invested,
    value,
    roiPct: invested ? (value / invested - 1) * 100 : 0,
    wins, losses, graded,
    hitRatePct: graded ? (wins / graded) * 100 : null,
  };
}
