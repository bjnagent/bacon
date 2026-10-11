import { describe, it, expect } from "vitest";
import type { MeState } from "@/components/app/AppContext";
import type { PlanState } from "@/lib/entitlements";
import { PLANS, type PlanId } from "@/lib/plans";
import { formatDay, meterRows, planActions, planBadge, planStatus, planTitle, upgradeAdds } from "./plan";

const NOW = new Date("2026-10-11T12:00:00Z");
const FMT = { locale: "en-US", timeZone: "UTC", now: NOW };

function me(plan: Partial<PlanState> & { plan: PlanId; source: PlanState["source"] }, extra: Partial<MeState> = {}): MeState {
  const state: PlanState = {
    status: "active", provider: null, interval: null, periodEnd: null, cancelAtPeriodEnd: false, trialEndsAt: null,
    usage: {}, resetsAt: "2026-11-01T00:00:00.000Z", ...plan,
  };
  const p = PLANS[state.plan];
  return {
    user: { id: "u1", email: "a@b.co" }, plan: state, limits: p.limits, features: p.features,
    watchlistMax: p.watchlistMax, themesMax: p.themesMax, trialDaysLeft: null, ...extra,
  };
}

const trial = (days: number) => me({ plan: "pro", source: "trial", status: "trialing", trialEndsAt: "2026-10-16T09:00:00Z" }, { trialDaysLeft: days });
const sub = (o: Partial<PlanState> = {}) => me({ plan: "pro", source: "subscription", provider: "stripe", interval: "year", periodEnd: "2027-03-02T00:00:00Z", ...o });

describe("formatDay", () => {
  it("omits the year for this year and includes it otherwise", () => {
    expect(formatDay("2026-10-16T09:00:00Z", FMT)).toBe("Oct 16");
    expect(formatDay("2027-03-02T00:00:00Z", FMT)).toBe("Mar 2, 2027");
  });
  it("is empty for missing or junk input", () => {
    expect(formatDay(null, FMT)).toBe("");
    expect(formatDay("not a date", FMT)).toBe("");
  });
});

describe("planBadge", () => {
  it("labels every plan state", () => {
    expect(planBadge(trial(5))).toEqual({ label: "Pro trial · 5 days left", tone: "accent" });
    expect(planBadge(trial(1)).label).toBe("Pro trial · 1 day left");
    expect(planBadge(trial(0)).label).toBe("Pro trial · ends today");
    expect(planBadge(me({ plan: "free", source: "free", status: "free" })).label).toBe("Free");
    expect(planBadge(sub()).label).toBe("Pro");
    expect(planBadge(sub({ plan: "desk" })).label).toBe("Desk");
    expect(planBadge(me({ plan: "desk", source: "operator" })).label).toBe("Operator");
  });
  it("never claims a paid plan for the billing-outage fallback", () => {
    expect(planBadge(me({ plan: "desk", source: "fallback" })).label).toBe("Full access");
    expect(planTitle(me({ plan: "desk", source: "fallback" }))).toBe("Full access");
  });
  it("flags a failed payment", () => {
    expect(planBadge(sub({ status: "past_due" })).tone).toBe("warn");
  });
});

describe("planStatus", () => {
  it("counts down a trial and says what comes after", () => {
    expect(planStatus(trial(5), FMT)).toEqual({ text: "5 days left · ends Oct 16, then Free", tone: "neutral" });
    expect(planStatus(trial(2), FMT).tone).toBe("warn");
    expect(planStatus(trial(0), FMT).text).toBe("Your trial ends today, then you move to Free");
  });
  it("shows the renewal date with the billing cadence", () => {
    expect(planStatus(sub(), FMT).text).toBe("Yearly · Renews Mar 2, 2027");
    expect(planStatus(sub({ interval: "month", periodEnd: "2026-11-02T00:00:00Z" }), FMT).text).toBe("Monthly · Renews Nov 2");
  });
  it("shows the end date once cancelled", () => {
    expect(planStatus(sub({ cancelAtPeriodEnd: true }), FMT)).toEqual({ text: "Cancels on Mar 2, 2027", tone: "warn" });
  });
  it("puts a payment problem first", () => {
    expect(planStatus(sub({ status: "past_due", cancelAtPeriodEnd: true }), FMT)).toEqual({ text: "Payment issue — update your payment method", tone: "neg" });
  });
  it("explains operator and fallback accounts without plan dates", () => {
    expect(planStatus(me({ plan: "desk", source: "operator" }), FMT).text).toBe("The account that runs the desk");
    expect(planStatus(me({ plan: "desk", source: "fallback" }), FMT).text).toBe("Every feature is available right now");
  });
});

// Fixed allowances, so these tests pin the wording rather than today's catalog numbers.
const LIMITS = { analysis: 3, deep: 0, chat: 15, sweep: 0, update: 1 };

describe("meterRows", () => {
  it("phrases usage as 'x of y' and hides meters the plan doesn't include", () => {
    const free = me({ plan: "free", source: "free", status: "free", usage: { analysis: 2, chat: 9 } }, { limits: LIMITS });
    const rows = meterRows(free);
    expect(rows.map((r) => r.meter)).toEqual(["analysis", "chat", "update"]);
    expect(rows[0]).toMatchObject({ label: "2 of 3 deep dives", left: 1 });
    expect(rows[1].label).toBe("9 of 15 chat messages");
    expect(rows[2].label).toBe("0 of 1 refresh");
  });
  it("never prints more used than the limit", () => {
    const rows = meterRows(sub({ usage: { analysis: 31 } }));
    const limit = PLANS.pro.limits.analysis;
    expect(rows[0]).toMatchObject({ used: limit, left: 0, label: `${limit} of ${limit} deep dives` });
  });
  it("is empty for unmetered accounts", () => {
    expect(meterRows(me({ plan: "desk", source: "operator" }))).toEqual([]);
  });
});

describe("upgradeAdds", () => {
  it("names what the next plan adds that this one lacks", () => {
    const pro = PLANS.pro.limits;
    expect(upgradeAdds(me({ plan: "free", source: "free", status: "free" }, { limits: LIMITS })))
      .toBe(`Pro adds ${pro.deep} pressure tests and ${pro.sweep} on-demand briefs a month.`);
  });
  it("is null when nothing is missing or there is no higher plan", () => {
    expect(upgradeAdds(sub())).toBeNull();
    expect(upgradeAdds(sub({ plan: "desk" }))).toBeNull();
    expect(upgradeAdds(me({ plan: "desk", source: "operator" }))).toBeNull();
  });
});

describe("planActions", () => {
  it("offers upgrade (and restore in the app) when not subscribed", () => {
    expect(planActions(me({ plan: "free", source: "free", status: "free" }), false)).toMatchObject({ primary: "upgrade", restore: false, manage: false });
    expect(planActions(trial(3), true)).toMatchObject({ primary: "upgrade", restore: true });
  });
  it("lets a web subscriber change and manage on the web", () => {
    expect(planActions(sub(), false)).toEqual({ primary: null, changePlan: true, manage: true, restore: false, note: null });
  });
  it("never links the Stripe portal or a second purchase from inside the iOS app", () => {
    const a = planActions(sub(), true);
    expect(a).toMatchObject({ changePlan: false, manage: false, primary: null });
    expect(a.note).toMatch(/on the web/);
  });
  it("sends App Store subscribers to Apple from anywhere, but changes plans only in the app", () => {
    expect(planActions(sub({ provider: "app_store" }), true)).toMatchObject({ changePlan: true, manage: true, restore: true, note: null });
    const web = planActions(sub({ provider: "app_store" }), false);
    expect(web).toMatchObject({ changePlan: false, manage: true });
    expect(web.note).toMatch(/iOS app/);
  });
  it("makes fixing a failed payment the main action", () => {
    expect(planActions(sub({ status: "past_due" }), false)).toMatchObject({ primary: "fix_payment", changePlan: false, manage: false });
  });
  it("shows nothing actionable for operator, fallback or hand-managed plans", () => {
    expect(planActions(me({ plan: "desk", source: "operator" }), false)).toMatchObject({ primary: null, changePlan: false, manage: false, restore: false });
    const manual = planActions(sub({ provider: "manual" }), false);
    expect(manual).toMatchObject({ primary: null, changePlan: false, manage: false });
    expect(manual.note).toBeTruthy();
  });
});
