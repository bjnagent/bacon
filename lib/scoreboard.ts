// All-time track-record scoreboard — the headline the honesty loop was missing:
// across every priced brief, what would the hypothetical $10K-per-idea baskets be
// worth now, and how often did the calls actually play out? Pure aggregation over
// the stored per-day ROI snapshots + the review verdicts, so no re-pricing.

export interface DayTotals { invested: number; value: number; roiPct: number; count?: number; spyPct?: number | null; alphaPct?: number | null }
export interface ScoreItem { verdict?: string }
export interface ScoreBrief { id: string; items: ScoreItem[]; roi?: DayTotals | null }

export interface Scoreboard {
  pricedDays: number;
  invested: number;
  value: number;
  roiPct: number;
  spyValue: number | null;   // the same stakes in SPY instead
  alphaPct: number | null;   // roiPct − SPY over the same windows
  wins: number;      // verdict "played-out"
  losses: number;    // verdict "faded" | "invalidated"
  graded: number;    // wins + losses
  hitRatePct: number | null;
}

// `live` lets a freshly-priced day (in the UI, not yet reloaded) override its
// stored snapshot so the scoreboard reflects the latest re-price immediately.
export function computeScoreboard(briefs: ScoreBrief[], live: Record<string, DayTotals | undefined> = {}): Scoreboard {
  let invested = 0, value = 0, pricedDays = 0;
  // Alpha compares like-for-like: bacon's return vs SPY's over the SAME windows,
  // using only the days where the benchmark was captured.
  let spyValue = 0, covInvested = 0, covValue = 0;
  for (const b of briefs) {
    const t = live[b.id] ?? b.roi;
    if (t && t.invested > 0) {
      invested += t.invested; value += t.value; pricedDays++;
      if (t.spyPct != null) {
        spyValue += t.invested * (1 + t.spyPct / 100);
        covInvested += t.invested; covValue += t.value;
      }
    }
  }
  let wins = 0, losses = 0;
  for (const b of briefs) for (const it of b.items) {
    if (it.verdict === "played-out") wins++;
    else if (it.verdict === "invalidated" || it.verdict === "faded") losses++;
  }
  const graded = wins + losses;
  const roiPct = invested ? (value / invested - 1) * 100 : 0;
  const alphaPct = covInvested > 0
    ? (covValue / covInvested - 1) * 100 - (spyValue / covInvested - 1) * 100
    : null;
  return {
    pricedDays,
    invested,
    value,
    roiPct,
    spyValue: covInvested > 0 ? spyValue : null,
    alphaPct,
    wins, losses, graded,
    hitRatePct: graded ? (wins / graded) * 100 : null,
  };
}
