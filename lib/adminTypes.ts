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
export interface Overview {
  days: number; totals: Totals; daily: DayRow[];
  byRoute: RouteRow[]; byModel: ModelRow[]; recent: EventRow[];
}
export interface UserRow {
  userId: string; email: string | null; signedUp: string; lastSignIn: string | null;
  calls: number; tokens: number; cost: number; searches: number; errors: number; routes: number;
  topRoute: string | null; lastCall: string | null;
  watchlist: number; themes: number; briefs: number; callsFiled: number; usedToday: number;
}
