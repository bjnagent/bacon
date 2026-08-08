// Shapes the admin RPCs return. Kept in their own module with zero imports:
// `lib/admin.ts` pulls in the service-role Supabase client, and the console is a
// client component — sharing types through here means the browser bundle never
// has a reason to reach for server-only code.

export interface Totals {
  calls: number; input: number; output: number; cacheRead: number; cacheWrite: number;
  searches: number; cost: number; errors: number; unpriced: number; users: number;
  p50ms: number; p95ms: number;
}
export interface DayRow { day: string; calls: number; tokens: number; cost: number; users: number; errors: number }
export interface RouteRow { route: string; calls: number; tokens: number; searches: number; cost: number; errors: number; avgMs: number }
export interface ModelRow { provider: string; model: string; calls: number; input: number; output: number; cost: number; priced: boolean }
export interface EventRow {
  at: string; email: string | null; route: string; provider: string; model: string;
  tokens: number; searches: number; cost: number; ms: number | null; ok: boolean;
}
/**
 * Everything that predates the `ai_events` ledger. `ai_usage` is the quota
 * meter — it counts CALLS with no token or cost detail — so it can't be folded
 * into the cost totals and lives here instead. Without this block the console
 * reads "no data" on a product with weeks of history behind it.
 */
export interface Activity {
  since: string | null;          // first day the quota meter recorded anything
  aiCalls: number;
  activeUsers: number;
  byDay: { day: string; calls: number; users: number }[];
  briefs: number; callsFiled: number; picks: number; news: number;
  chats: number; watchlist: number; themes: number; outlooks: number;
}
/**
 * Feature popularity from the behaviour ledger. Most of the product costs
 * nothing to open, so none of it appears in `byRoute` — this is the only view
 * that shows whether Radar, News or the track record are used at all.
 */
export interface FeatureRow {
  name: string; kind: string; hits: number; users: number; lastAt: string | null;
}
export interface SubjectRow { detail: string; hits: number; users: number }
export interface Overview {
  days: number; totals: Totals; daily: DayRow[];
  byRoute: RouteRow[]; byModel: ModelRow[]; recent: EventRow[];
  activity: Activity;
  /** Ranked by reach (distinct users), not raw hits. */
  byFeature: FeatureRow[];
  /** Most-analyzed / most-discussed names across all accounts. */
  topSubjects: SubjectRow[];
  /** First metered call. Null = metering hasn't recorded yet — NOT "no usage". */
  meteringSince: string | null;
}
export interface UserRow {
  userId: string; email: string | null; signedUp: string; lastSignIn: string | null;
  calls: number; tokens: number; cost: number; searches: number; errors: number; routes: number;
  topRoute: string | null; lastCall: string | null;
  /** Behaviour on the free surface — invisible to the cost ledger. */
  events: number;
  /** Distinct days with activity: separates a one-day trial from a habit. */
  activeDays: number;
  topFeature: string | null;
  lastEvent: string | null;
  watchlist: number; themes: number; briefs: number; callsFiled: number; usedToday: number;
  /** Lifetime calls from the quota meter — the only per-user history predating the ledger. */
  lifetimeCalls: number;
  chats: number;
  symbols: string[];
  themeLabels: string[];
  lastSeen: string | null;
}

// Per-user drill-down: what this account is actually doing.
export interface ChatRow { at: string; conversation: string; role: "user" | "assistant"; text: string; truncated: boolean }
export interface WatchRow {
  at: string; symbol: string; cls: string | null; lean: string | null;
  conviction: number | null; thesis: string; note: string; status: string | null; lastScan: string | null;
}
export interface CallRow {
  at: string; instrument: string; action: string; source: string; conviction: number | null;
  target: string | null; horizon: string | null;
  actualPct: number | null; benchPct: number | null; hit: boolean | null; gradedAt: string | null;
}
/** One step in the session trail: where this account went, and on what. */
export interface TrailRow { at: string; kind: string; name: string; detail: string | null }
export interface UserDetail {
  userId: string;
  email: string | null;
  chat: ChatRow[];
  watchlist: WatchRow[];
  themes: { at: string; label: string }[];
  calls: CallRow[];
  briefs: { day: string; items: number; reviewed: boolean }[];
  usage: { day: string; calls: number }[];
  events: TrailRow[];
  featureTotals: { name: string; kind: string; hits: number; lastAt: string }[];
}
