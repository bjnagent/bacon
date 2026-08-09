// The house record: Bacon's own calls, graded, in public.
//
// Every user's track record is their own — `calls` is RLS-scoped per user, so a
// new account's scorecard is empty for a month and statistically quiet for
// three. That makes the product's strongest claim unprovable at exactly the
// moment a prospect is deciding. The house account fixes that: one designated
// account sweeps daily through the same code path everyone else gets, and its
// graded calls are readable without a login.
//
// Two rules make this proof rather than marketing, and both are structural
// rather than editorial:
//
//   1. NO FILTERING BY OUTCOME. `summarise` takes whatever it is handed and
//      the API hands it every priced call. There is no losing-call branch to
//      quietly remove, so a flattering subset cannot be selected by accident
//      or on purpose.
//   2. OPEN CALLS ARE SHOWN AS OPEN. A call is priced 30 days after it is
//      filed but only finalised when its horizon lands. Hiding the in-flight
//      ones would let the record be timed; labelling them is honest and more
//      useful.

/** One call as the public record sees it. No user id, no thesis — the call and its outcome. */
export interface PublicCall {
  instrument: string;
  action: string;
  source: string;
  conviction: number | null;
  targetText: string | null;
  calledAt: string;
  horizonDate: string;
  /** Realised move since the call. Null until the 30-day pricing pass runs. */
  actualPct: number | null;
  /** SPY over the same window. Null for calls with no equity benchmark (e.g. property). */
  benchPct: number | null;
  /** Did it move the way the call said? Null when the call stated no direction. */
  hit: boolean | null;
  /** True once the horizon has passed and the result is final. */
  settled: boolean;
}

export interface HouseSummary {
  /** Every call on record, including ones too new to have been priced. */
  filed: number;
  /** Calls with a realised move attached. */
  priced: number;
  /** Calls whose horizon has passed — the result can no longer change. */
  settled: number;
  /** Directional calls that went the right way, over those with a stated direction. */
  hits: number;
  directional: number;
  hitRatePct: number | null;
  /** Mean realised move across priced calls. */
  meanReturnPct: number | null;
  /**
   * Mean return and benchmark over ONLY the calls carrying a benchmark, so the
   * two numbers describe the same set of windows. Averaging Bacon over every
   * priced call and SPY over the subset that has one would flatter whichever
   * side happened to have the better sample.
   */
  benchmarked: number;
  meanBenchPct: number | null;
  alphaPct: number | null;
  /** Oldest and newest call dates, so a reader can see the record's span. */
  firstCallAt: string | null;
  lastCallAt: string | null;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarise(calls: PublicCall[]): HouseSummary {
  const priced = calls.filter((c) => c.actualPct != null);
  const directional = calls.filter((c) => c.hit != null);
  // Like-for-like: both averages come from this one subset.
  const benched = priced.filter((c) => c.benchPct != null);

  const meanReturnPct = mean(priced.map((c) => c.actualPct as number));
  const meanBenchPct = mean(benched.map((c) => c.benchPct as number));
  const meanOwnOnBenched = mean(benched.map((c) => c.actualPct as number));

  const dates = calls.map((c) => c.calledAt).filter(Boolean).sort();

  return {
    filed: calls.length,
    priced: priced.length,
    settled: calls.filter((c) => c.settled).length,
    hits: directional.filter((c) => c.hit).length,
    directional: directional.length,
    hitRatePct: directional.length ? (directional.filter((c) => c.hit).length / directional.length) * 100 : null,
    meanReturnPct,
    benchmarked: benched.length,
    meanBenchPct,
    alphaPct: meanOwnOnBenched != null && meanBenchPct != null ? meanOwnOnBenched - meanBenchPct : null,
    firstCallAt: dates[0] ?? null,
    lastCallAt: dates[dates.length - 1] ?? null,
  };
}

/** Row shape as stored. Kept here so the API route and the tests agree on it. */
export interface CallRecord {
  instrument: string; action: string; source: string; conviction: number | null;
  target_text: string | null; created_at: string; horizon_date: string;
  actual_pct: number | string | null; bench_pct: number | string | null;
  direction_hit: boolean | null; graded_at: string | null;
}

// Postgres numerics arrive as strings through PostgREST; coercing here keeps the
// arithmetic above honest rather than silently concatenating.
const num = (v: number | string | null): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toPublicCall(r: CallRecord): PublicCall {
  return {
    instrument: r.instrument,
    action: r.action,
    source: r.source,
    conviction: r.conviction,
    targetText: r.target_text,
    calledAt: String(r.created_at).slice(0, 10),
    horizonDate: r.horizon_date,
    actualPct: num(r.actual_pct),
    benchPct: num(r.bench_pct),
    hit: r.direction_hit,
    settled: r.graded_at != null,
  };
}
