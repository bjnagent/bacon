// The plan catalog — the single source of truth for what each tier costs, what
// it unlocks, and how much of each metered action it includes. The pricing page,
// the paywall, the server-side gate and the unit-economics model all read this
// file, so a price or a limit can never disagree between the place a user reads
// it and the place it is enforced.
//
// Pure data + pure functions: no I/O, safe to import on the client.

export type PlanId = "free" | "pro" | "desk";

/**
 * Metered actions, counted per calendar month (UTC). Each is a distinct line on
 * the AI bill, which is why they are separate meters rather than one pool:
 * a chat turn and a web-searched deep dive differ in cost by ~4x.
 */
export type Meter = "analysis" | "deep" | "chat" | "sweep" | "update";

/** Boolean capabilities. */
export type Feature =
  | "personal_brief"   // nightly brief built from YOUR watchlist + themes
  | "house_brief"      // the shared daily brief (same for every free member)
  | "kill_watch"       // daily re-check of each idea's kill condition
  | "email_brief"      // morning brief by email
  | "push_alerts"      // kill-condition + level-reached push alerts
  | "debate"           // Bull vs Bear
  | "personas"         // investor takes
  | "redteam"          // red-team the thesis
  | "chain"            // supply-chain / second-order map
  | "property";        // SG / AU property tracker

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** USD list price. Annual is the full-year charge. */
  price: { monthly: number; annual: number };
  /** Included per calendar month. */
  limits: Record<Meter, number>;
  /** Tracked names / scout themes. */
  watchlistMax: number;
  themesMax: number;
  features: Feature[];
  /** Bullet copy for the pricing table, in display order. */
  highlights: string[];
}

export const METER_LABEL: Record<Meter, { one: string; many: string }> = {
  analysis: { one: "deep dive", many: "deep dives" },
  deep: { one: "pressure test", many: "pressure tests" },
  chat: { one: "chat message", many: "chat messages" },
  sweep: { one: "on-demand brief", many: "on-demand briefs" },
  update: { one: "refresh", many: "refreshes" },
};

export const FEATURE_LABEL: Record<Feature, string> = {
  personal_brief: "Your own daily brief",
  house_brief: "The daily house brief",
  kill_watch: "Kill-condition watch",
  email_brief: "Morning email",
  push_alerts: "Push alerts",
  debate: "Bull vs Bear",
  personas: "Investor takes",
  redteam: "Red team",
  chain: "Chain map",
  property: "Property tracker",
};

// Allowances are sized against the measured unit costs at the bottom of this
// file so that a TYPICAL member (a quarter of every allowance) leaves a gross
// margin above ~65% after the channel fee, and a member who uses EVERYTHING
// still roughly covers their compute on a monthly plan. See
// docs/pricing-and-unit-economics.md before changing any number here.
const FREE_LIMITS: Record<Meter, number> = { analysis: 3, deep: 0, chat: 10, sweep: 0, update: 3 };
const PRO_LIMITS: Record<Meter, number> = { analysis: 25, deep: 15, chat: 80, sweep: 20, update: 40 };
const DESK_LIMITS: Record<Meter, number> = { analysis: 80, deep: 50, chat: 250, sweep: 40, update: 100 };

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "See how the desk thinks.",
    price: { monthly: 0, annual: 0 },
    limits: FREE_LIMITS,
    watchlistMax: 5,
    themesMax: 3,
    features: ["house_brief"],
    highlights: [
      "The daily house brief",
      `${FREE_LIMITS.analysis} eight-lens deep dives a month`,
      `${FREE_LIMITS.chat} chat messages a month`,
      "Track up to 5 names",
      "The public, graded track record",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Your own overnight research desk.",
    price: { monthly: 19.99, annual: 179.99 },
    limits: PRO_LIMITS,
    watchlistMax: 30,
    themesMax: 10,
    features: ["house_brief", "personal_brief", "kill_watch", "email_brief", "push_alerts", "debate", "personas", "property"],
    highlights: [
      "A brief built from your watchlist & themes, every morning",
      `${PRO_LIMITS.analysis} deep dives + ${PRO_LIMITS.deep} pressure tests a month`,
      "Bull vs Bear and investor takes",
      "Kill-condition watch with push alerts",
      `${PRO_LIMITS.chat} chat messages a month`,
      "Track up to 30 names + SG/AU property",
    ],
  },
  desk: {
    id: "desk",
    name: "Desk",
    tagline: "For the investor who runs a process.",
    price: { monthly: 49.99, annual: 449.99 },
    limits: DESK_LIMITS,
    watchlistMax: 100,
    themesMax: 25,
    features: ["house_brief", "personal_brief", "kill_watch", "email_brief", "push_alerts", "debate", "personas", "redteam", "chain", "property"],
    highlights: [
      "Everything in Pro",
      `${DESK_LIMITS.analysis} deep dives + ${DESK_LIMITS.deep} pressure tests a month`,
      "Red team and chain map on every idea",
      `${DESK_LIMITS.sweep} on-demand briefs a month`,
      `${DESK_LIMITS.chat} chat messages a month`,
      "Track up to 100 names",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "desk"];

/** Length of the no-card "reverse trial" every new account gets on Pro. */
export const TRIAL_DAYS = 7;

/**
 * Allowances DURING the reverse trial. Pro's features, but not a whole month of
 * Pro's compute in seven days: the trial exists to show the personalised brief
 * and a few deep dives, and an uncapped trial is the cheapest way for one
 * person to cost us a month of a paying member's usage with throwaway signups.
 */
export const TRIAL_LIMITS: Record<Meter, number> = { analysis: 8, deep: 4, chat: 25, sweep: 4, update: 10 };

/** Effective allowances for a plan, honouring the trial caps. */
export function limitsFor(plan: PlanId, trialing: boolean): Record<Meter, number> {
  if (!trialing) return PLANS[plan].limits;
  const base = PLANS[plan].limits;
  return Object.fromEntries((Object.keys(base) as Meter[]).map((m) => [m, Math.min(base[m], TRIAL_LIMITS[m])])) as Record<Meter, number>;
}

/** Which meter (if any) an AI route draws down, and which feature it needs. */
export const ROUTE_GATES: Record<string, { meter: Meter; feature?: Feature }> = {
  analyze: { meter: "analysis" },
  debate: { meter: "deep", feature: "debate" },
  personas: { meter: "deep", feature: "personas" },
  redteam: { meter: "deep", feature: "redteam" },
  chain: { meter: "deep", feature: "chain" },
  chat: { meter: "chat" },
  brief: { meter: "sweep", feature: "personal_brief" },
  scout: { meter: "update", feature: "personal_brief" },
  news: { meter: "update" },
  "track-update": { meter: "update" },
  "property-outlook": { meter: "update", feature: "property" },
};

export function isPlanId(v: unknown): v is PlanId {
  return v === "free" || v === "pro" || v === "desk";
}

export function planHas(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

/** The cheapest plan that unlocks a feature — what the paywall offers. */
export function cheapestPlanWith(feature: Feature): PlanId {
  return PLAN_ORDER.find((p) => planHas(p, feature)) ?? "desk";
}

/** The cheapest plan whose allowance for a meter is larger than the current one. */
export function nextPlanFor(meter: Meter, current: PlanId): PlanId | null {
  const cur = PLANS[current].limits[meter];
  return PLAN_ORDER.find((p) => PLANS[p].limits[meter] > cur && PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(current)) ?? null;
}

/** First day (UTC) of the metering period containing `at`, as YYYY-MM-DD. */
export function periodStart(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** When the current metering period resets (first instant of next UTC month). */
export function periodResetsAt(at: Date = new Date()): string {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString();
}

/** Effective monthly price of the annual plan, rounded to cents. */
export function annualMonthly(plan: PlanId): number {
  return Math.round((PLANS[plan].price.annual / 12) * 100) / 100;
}

/** Whole-percent saving of annual vs paying monthly for 12 months. */
export function annualSavingPct(plan: PlanId): number {
  const { monthly, annual } = PLANS[plan].price;
  if (!monthly) return 0;
  return Math.round((1 - annual / (monthly * 12)) * 100);
}

export function formatPrice(usd: number): string {
  return usd === 0 ? "$0" : `$${usd.toFixed(2).replace(/\.00$/, "")}`;
}

// ---------------------------------------------------------------------------
// Unit economics. Measured from the production `ai_events` ledger (Aug–Oct
// 2026, real provider token counts priced at list rates); see
// docs/pricing-and-unit-economics.md for the derivation. These are planning
// figures for the cost model and the operator console — never shown to users,
// never used for enforcement.

/** Expected USD cost of one metered action (ledger mean, rounded up). */
export const UNIT_COST_USD: Record<Meter, number> = {
  analysis: 0.2,   // Sonnet + up to 6 web searches; ledger 0.126 (n=1) to 0.25 at p90 brief-sized inputs
  deep: 0.13,      // debate/personas/redteam/chain; ledger debate mean 0.124
  chat: 0.06,      // Sonnet streaming turn with ≤5 searches; ledger 0.059
  sweep: 0.06,     // on-demand brief on the bulk model with the shared snapshot; ledger nightly 0.055
  update: 0.03,    // scout/news/track refresh on the cheap tier, Claude fallback
};

/** Fixed cost of one personalised nightly sweep (brief + scouts + news + watch). */
export const NIGHTLY_SWEEP_USD = 0.07;

/** Worst-case AI cost of one reverse trial (every trial allowance + a week of nightly sweeps). */
export function trialCostAtCap(): number {
  const metered = (Object.keys(TRIAL_LIMITS) as Meter[]).reduce((s, m) => s + TRIAL_LIMITS[m] * UNIT_COST_USD[m], 0);
  return Math.round((metered + NIGHTLY_SWEEP_USD * TRIAL_DAYS) * 100) / 100;
}

/** Monthly AI cost of a plan if every allowance is used in full. */
export function costAtCap(plan: PlanId): number {
  const p = PLANS[plan];
  const metered = (Object.keys(p.limits) as Meter[]).reduce((s, m) => s + p.limits[m] * UNIT_COST_USD[m], 0);
  const nightly = planHas(plan, "personal_brief") ? NIGHTLY_SWEEP_USD * 30 : 0;
  return Math.round((metered + nightly) * 100) / 100;
}

/** Monthly AI cost at a given utilisation of the metered allowances (0..1). */
export function costAtUtilisation(plan: PlanId, utilisation: number): number {
  const p = PLANS[plan];
  const metered = (Object.keys(p.limits) as Meter[]).reduce((s, m) => s + p.limits[m] * UNIT_COST_USD[m], 0);
  const nightly = planHas(plan, "personal_brief") ? NIGHTLY_SWEEP_USD * 30 : 0;
  return Math.round((metered * utilisation + nightly) * 100) / 100;
}

/** Revenue kept after the payment channel's cut. */
export type Channel = "web" | "app_store" | "app_store_small_business";
export function netRevenue(gross: number, channel: Channel): number {
  if (gross === 0) return 0;
  const net =
    channel === "web" ? gross * (1 - 0.029) - 0.3          // Stripe card rate
      : channel === "app_store" ? gross * 0.7              // standard 30%
        : gross * 0.85;                                   // Small Business Program / year-2 subscriptions
  return Math.round(net * 100) / 100;
}
