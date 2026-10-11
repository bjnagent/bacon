// The track record's pure logic: call status, list filters, the $10K-per-call
// series and the chart's geometry. No React and no I/O, so the signed-in Record
// tab, the public /record page and the tests all compute from the same code.
//
// Two rules carried over from lib/houseRecord.ts, because they are what make a
// record proof rather than marketing:
//   - Nothing here drops a call for its outcome. Filters exist to READ the
//     list; every headline number is computed from the unfiltered set.
//   - The SPY comparison only ever uses calls that carry a benchmark, on both
//     sides, so the two lines describe the same windows.

import type { PublicCall } from "@/lib/houseRecord";

/** One of the signed-in account's calls, as GET /api/calibration returns it. */
export interface RecordCall extends PublicCall {
  id: string;
  /** How loud the name was when the call was filed: hot | warm | quiet. */
  crowded: string | null;
  /** Realised vs the stated base case, once the horizon has landed. */
  targetErrPct: number | null;
}

/** GET /api/calibration */
export interface RecordPayload {
  total: number;
  /** Calls graded in a direction — the count the calibration memo waits on. */
  graded: number;
  finalized: number;
  memo: string;
  /** Direction-graded calls needed before the memo says anything. */
  minGraded: number;
  calls: RecordCall[];
  truncated: boolean;
}

/** A call is first priced this many days after it is filed. */
export const GRADE_AFTER_DAYS = 30;
/** The hypothetical stake per call. */
export const STAKE = 10_000;

// ---------- status ----------

/**
 * pending: filed, not yet priced (younger than 30 days, or awaiting the run).
 * open:    priced, but its horizon hasn't landed — the result can still move.
 * final:   horizon passed; the result is fixed.
 *
 * "pending" and "open" are both shown as open: neither is a finished result,
 * and the public record promises open calls are labelled as such.
 */
export type CallStatus = "pending" | "open" | "final";

export function callStatus(c: Pick<PublicCall, "actualPct" | "settled">): CallStatus {
  if (c.actualPct == null) return "pending";
  return c.settled ? "final" : "open";
}

export const isOpen = (c: Pick<PublicCall, "actualPct" | "settled">) => callStatus(c) !== "final";
export const isGraded = (c: Pick<PublicCall, "actualPct">) => c.actualPct != null;

/** YYYY-MM-DD plus n days, in UTC (call dates are calendar days, not instants). */
export function addDays(day: string, n: number): string {
  const t = Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return day;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** The day a call is first priced. */
export const gradesOn = (c: Pick<PublicCall, "calledAt">) => addDays(c.calledAt, GRADE_AFTER_DAYS);

// ---------- filters (for reading the list only) ----------

export type CallFilter = "all" | "open" | "graded" | "hits" | "misses";

export const FILTERS: { value: CallFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "graded", label: "Graded" },
  { value: "hits", label: "Hits" },
  { value: "misses", label: "Misses" },
];

export function filterCalls<T extends PublicCall>(calls: T[], f: CallFilter): T[] {
  switch (f) {
    case "open": return calls.filter(isOpen);
    case "graded": return calls.filter(isGraded);
    case "hits": return calls.filter((c) => c.hit === true);
    case "misses": return calls.filter((c) => c.hit === false);
    default: return calls;
  }
}

export function filterCounts(calls: PublicCall[]): Record<CallFilter, number> {
  return {
    all: calls.length,
    open: calls.filter(isOpen).length,
    graded: calls.filter(isGraded).length,
    hits: calls.filter((c) => c.hit === true).length,
    misses: calls.filter((c) => c.hit === false).length,
  };
}

/** Earliest first-grade date among calls still waiting for one (today or later). */
export function nextGradeDate(calls: PublicCall[], today: string): string | null {
  const due = calls
    .filter((c) => c.actualPct == null)
    .map(gradesOn)
    .filter((d) => d >= today)
    .sort();
  return due[0] ?? null;
}

// ---------- the $10K-per-call series ----------

export interface ValuePoint {
  /** Filing date of the calls added at this point. */
  date: string;
  /** Calls included so far. */
  calls: number;
  invested: number;
  /** What the stakes in Bacon's calls are worth at their latest grade. */
  value: number;
  /** The same stakes in SPY over each call's own window. */
  spyValue: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Cumulative value of a hypothetical $10K in every benchmarked, graded call,
 * against the same money in SPY over the same windows — one point per filing
 * date. Calls without a benchmark (property) are left out of BOTH lines, which
 * is exactly the subset `summarise()` measures alpha on, so the gap between the
 * last two values equals that alpha on the money.
 */
export function buildValueSeries(calls: PublicCall[], stake = STAKE): ValuePoint[] {
  const benched = calls
    .filter((c) => c.actualPct != null && c.benchPct != null && !!c.calledAt)
    .slice()
    .sort((a, b) => (a.calledAt < b.calledAt ? -1 : a.calledAt > b.calledAt ? 1 : 0));
  const out: ValuePoint[] = [];
  let invested = 0, value = 0, spyValue = 0;
  benched.forEach((c, i) => {
    invested += stake;
    value += stake * (1 + (c.actualPct as number) / 100);
    spyValue += stake * (1 + (c.benchPct as number) / 100);
    const p: ValuePoint = { date: c.calledAt, calls: i + 1, invested, value: cents(value), spyValue: cents(spyValue) };
    if (out.length && out[out.length - 1].date === c.calledAt) out[out.length - 1] = p;
    else out.push(p);
  });
  return out;
}

// ---------- chart geometry ----------

/** Round tick values spanning [lo, hi], always including 0 when it is in range. */
export function niceTicks(lo: number, hi: number, maxTicks = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0];
  if (lo === hi) { const pad = Math.abs(lo) || 1; lo -= pad; hi += pad; }
  const span = hi - lo;
  const raw = span / Math.max(1, maxTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : Math.round(v * 1e6) / 1e6);
  return ticks;
}

export interface ChartGeometry {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  /** Pixel x and the two gains (value − invested) for each point. */
  xs: number[];
  gain: number[];
  spyGain: number[];
  callsPath: string;
  spyPath: string;
  /** Wash between the calls line and $0. */
  callsArea: string;
  zeroY: number;
  yTicks: { value: number; y: number }[];
  y: (v: number) => number;
}

const PAD = { top: 12, right: 14, bottom: 26, left: 52 };

/**
 * Lay the series out on a `width × height` canvas. X is real time (filing
 * date), not index, so a month with no graded calls reads as a gap rather than
 * being squeezed out. Y is the cumulative gain or loss in dollars, with $0 as
 * the baseline both lines start from.
 */
export function chartGeometry(points: ValuePoint[], width: number, height: number): ChartGeometry {
  const plot = { left: PAD.left, right: Math.max(PAD.left + 1, width - PAD.right), top: PAD.top, bottom: Math.max(PAD.top + 1, height - PAD.bottom) };
  const gain = points.map((p) => p.value - p.invested);
  const spyGain = points.map((p) => p.spyValue - p.invested);
  const ticks = niceTicks(Math.min(0, ...gain, ...spyGain), Math.max(0, ...gain, ...spyGain), height < 220 ? 3 : 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = (v: number) => plot.bottom - ((v - lo) / (hi - lo || 1)) * (plot.bottom - plot.top);

  const ts = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const t0 = ts[0] ?? 0, t1 = ts[ts.length - 1] ?? 0;
  const xs = ts.map((t, i) => (t1 > t0
    ? plot.left + ((t - t0) / (t1 - t0)) * (plot.right - plot.left)
    : plot.left + (points.length > 1 ? (i / (points.length - 1)) * (plot.right - plot.left) : 0)));

  const r = (n: number) => Math.round(n * 10) / 10;
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${r(xs[i])} ${r(y(v))}`).join(" ");
  const zeroY = y(0);
  const callsPath = line(gain);
  const callsArea = points.length
    ? `${callsPath} L${r(xs[xs.length - 1])} ${r(zeroY)} L${r(xs[0])} ${r(zeroY)} Z`
    : "";

  return {
    width, height, plot, xs, gain, spyGain,
    callsPath, spyPath: line(spyGain), callsArea, zeroY,
    yTicks: ticks.map((value) => ({ value, y: y(value) })),
    y,
  };
}

/** Index of the point whose x is nearest to `px`. */
export function nearestIndex(xs: number[], px: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
  return best;
}

// ---------- formatting (locale + zone pinned, so server and client agree) ----------

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const parseDay = (d: string) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
const valid = (d: Date) => Number.isFinite(d.getTime());

/** "Oct 9" */
export const fmtDay = (d: string) => { const x = parseDay(d); return valid(x) ? DAY.format(x) : d; };
/** "Oct 9, 2026" */
export const fmtDate = (d: string) => { const x = parseDay(d); return valid(x) ? DATE.format(x) : d; };
/** "Thu, Oct 9" */
export const fmtWeekday = (d: string) => { const x = parseDay(d); return valid(x) ? WEEKDAY.format(x) : d; };

/** "$10,850.25" — money figures are exact to the cent. */
export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "$107,970" — whole dollars for headline totals. */
export const usd0 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
/** "+$850.25" / "−$120.00" */
export const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
/** "+$7,970" — whole dollars, for headline gains. */
export const signedUsd0 = (n: number) => `${n >= 0 ? "+" : "−"}${usd0(Math.abs(n))}`;
/** Axis ticks: "+$10K", "$0", "−$2.5K". */
export function compactUsd(n: number): string {
  if (n === 0) return "$0";
  const a = Math.abs(n);
  const body = a >= 1_000_000 ? `${trim(a / 1_000_000)}M` : a >= 1000 ? `${trim(a / 1000)}K` : `${Math.round(a)}`;
  return `${n > 0 ? "+" : "−"}$${body}`;
}
const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
/** "+5.3%" / "−2.0%" (a real minus sign, so columns of numbers line up). */
export const pct = (n: number | null | undefined, dp = 1) =>
  n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}%`;

/** First word of an action, sentence-cased: "accumulate" → "Accumulate". */
export function actionLabel(action: string): string {
  const head = (action || "").trim().split(/[\s·—-]+/)[0] ?? "";
  return head ? head[0].toUpperCase() + head.slice(1).toLowerCase() : "Call";
}

export const SOURCE_LABEL: Record<string, string> = {
  brief: "Daily brief",
  analyze: "Analysis",
  property: "Property",
};

export const CROWDING_LABEL: Record<string, string> = {
  hot: "Hot — heavily discussed",
  warm: "Warm — some chatter",
  quiet: "Quiet — little discussion",
};
