// Plan copy for the Account tab, as pure functions of GET /api/me.
//
// Kept out of the components so every state a paying member can be in —
// trial, renewing, cancelling, a failed card, comped, unmetered — has a test
// that pins its wording. A wrong "Renews" date on a billing screen costs more
// trust than any other bug on it.

import { METER_LABEL, PLANS, PLAN_ORDER, type Meter, type PlanId } from "@/lib/plans";
import type { MeState } from "@/components/app/AppContext";
import type { Tone } from "@/components/ui/Badge";

export interface DateFmt {
  locale?: string;
  /** Tests pin UTC; the app uses the device zone. */
  timeZone?: string;
  now?: Date;
}

/** "Oct 16", or "Oct 16, 2027" when it isn't this year. */
export function formatDay(iso: string | null | undefined, fmt: DateFmt = {}): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = fmt.now ?? new Date();
  const yearOf = (x: Date) => Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: fmt.timeZone }).format(x));
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: fmt.timeZone };
  if (yearOf(d) !== yearOf(now)) opts.year = "numeric";
  return d.toLocaleDateString(fmt.locale, opts);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Operator and fallback accounts are never metered, so meters would be noise. */
export function isUnmetered(me: MeState): boolean {
  return me.plan.source === "operator" || me.plan.source === "fallback";
}

function trialLeft(me: MeState): string {
  const days = me.trialDaysLeft ?? 0;
  return days <= 0 ? "ends today" : `${plural(days, "day", "days")} left`;
}

/** The pill next to the avatar. */
export function planBadge(me: MeState): { label: string; tone: Tone } {
  const { plan } = me;
  switch (plan.source) {
    case "operator": return { label: "Operator", tone: "info" };
    // The billing tables couldn't be read, so everyone is waved through. Don't
    // claim a paid plan the member never bought.
    case "fallback": return { label: "Full access", tone: "neutral" };
    case "trial": return { label: `Pro trial · ${trialLeft(me)}`, tone: "accent" };
    case "subscription": return { label: PLANS[plan.plan].name, tone: plan.status === "past_due" ? "warn" : "accent" };
    default: return { label: "Free", tone: "neutral" };
  }
}

/** Heading of the plan card. */
export function planTitle(me: MeState): string {
  const { plan } = me;
  if (plan.source === "operator") return "Operator";
  if (plan.source === "fallback") return "Full access";
  if (plan.source === "trial") return `${PLANS[plan.plan].name} trial`;
  return PLANS[plan.plan].name;
}

export type StatusTone = "neutral" | "warn" | "neg";

/** One line under the plan name: what happens next, and when. */
export function planStatus(me: MeState, fmt: DateFmt = {}): { text: string; tone: StatusTone } {
  const { plan } = me;
  switch (plan.source) {
    // The card body already says "Unmetered"; this line says why.
    case "operator": return { text: "The account that runs the desk", tone: "neutral" };
    case "fallback": return { text: "Every feature is available right now", tone: "neutral" };
    case "trial": {
      const ends = formatDay(plan.trialEndsAt, fmt);
      const days = me.trialDaysLeft ?? 0;
      if (days <= 0) return { text: "Your trial ends today, then you move to Free", tone: "warn" };
      return { text: `${plural(days, "day", "days")} left${ends ? ` · ends ${ends}` : ""}, then Free`, tone: days <= 2 ? "warn" : "neutral" };
    }
    case "subscription": {
      if (plan.status === "past_due") return { text: "Payment issue — update your payment method", tone: "neg" };
      const end = formatDay(plan.periodEnd, fmt);
      const cadence = plan.interval === "year" ? "Yearly" : plan.interval === "month" ? "Monthly" : "";
      if (plan.cancelAtPeriodEnd) return { text: end ? `Cancels on ${end}` : "Cancels at the end of this period", tone: "warn" };
      if (end) return { text: [cadence, `Renews ${end}`].filter(Boolean).join(" · "), tone: "neutral" };
      return { text: cadence ? `${cadence} · active` : "Active", tone: "neutral" };
    }
    default: return { text: "The daily house brief, plus a monthly allowance", tone: "neutral" };
  }
}

export interface MeterRow {
  meter: Meter;
  used: number;
  limit: number;
  /** "7 of 30 deep dives" */
  label: string;
  left: number;
}

/** Meters the current plan includes, in catalog order. Zero-limit meters are left out. */
export function meterRows(me: MeState): MeterRow[] {
  if (isUnmetered(me)) return [];
  return (Object.keys(METER_LABEL) as Meter[])
    .filter((m) => (me.limits[m] ?? 0) > 0)
    .map((m) => {
      const limit = me.limits[m];
      // Usage can briefly overshoot (a refund racing a new request); never print "31 of 30".
      const used = Math.min(limit, Math.max(0, me.plan.usage[m] ?? 0));
      const lbl = METER_LABEL[m];
      return { meter: m, used, limit, left: limit - used, label: `${used} of ${limit} ${limit === 1 ? lbl.one : lbl.many}` };
    });
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * What the next plan up adds that this plan doesn't have at all, e.g.
 * "Pro adds 20 pressure tests and 30 on-demand briefs a month." Null when every
 * meter is already included (bigger allowances are the paywall's job).
 */
export function upgradeAdds(me: MeState): string | null {
  if (isUnmetered(me)) return null;
  const idx = PLAN_ORDER.indexOf(me.plan.plan);
  const next: PlanId | undefined = PLAN_ORDER[idx + 1];
  if (!next) return null;
  const missing = (Object.keys(METER_LABEL) as Meter[]).filter((m) => (me.limits[m] ?? 0) <= 0 && PLANS[next].limits[m] > 0);
  if (!missing.length) return null;
  const parts = missing.map((m) => plural(PLANS[next].limits[m], METER_LABEL[m].one, METER_LABEL[m].many));
  return `${PLANS[next].name} adds ${joinAnd(parts)} a month.`;
}

export interface PlanActions {
  /** Main call to action. */
  primary: "upgrade" | "fix_payment" | null;
  /** Re-open the paywall to pick another tier on the channel they bought on. */
  changePlan: boolean;
  /** Stripe portal (web) or Apple's subscription page. */
  manage: boolean;
  /** StoreKit restore; iOS app only. */
  restore: boolean;
  /** Shown when the plan was bought on the other channel and can't be changed from here. */
  note: string | null;
}

/**
 * Which buttons the plan card shows. The channel matters: a web (Stripe)
 * subscriber who taps "Change plan" inside the iOS app would start a second,
 * App Store subscription — and vice versa — so each channel only manages its own.
 */
export function planActions(me: MeState, native: boolean): PlanActions {
  const { plan } = me;
  const none: PlanActions = { primary: null, changePlan: false, manage: false, restore: false, note: null };
  if (isUnmetered(me)) return none;

  if (plan.source !== "subscription") {
    return { ...none, primary: "upgrade", restore: native };
  }

  const provider = plan.provider;
  if (provider === "manual") {
    // Comped or invoiced by hand: there is no portal to send them to.
    return { ...none, note: `Your plan is managed by the Bacon team — email support to change it.` };
  }
  const appStore = provider === "app_store";
  const sameChannel = appStore ? native : !native;
  const pastDue = plan.status === "past_due";
  return {
    primary: pastDue && (appStore || !native) ? "fix_payment" : null,
    changePlan: sameChannel && !pastDue,
    // Apple's page opens fine from the web; the Stripe portal is never linked
    // from inside the iOS app (App Store Review Guideline 3.1.1).
    manage: !pastDue && (appStore || !native),
    restore: native && appStore,
    note: sameChannel ? null
      : appStore ? "You subscribed in the iOS app — change or cancel it from your Apple ID subscriptions."
        : "You subscribed on the web — manage billing from Bacon in a browser.",
  };
}
