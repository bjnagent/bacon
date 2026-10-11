import { describe, it, expect } from "vitest";
import {
  PLANS, PLAN_ORDER, ROUTE_GATES, annualSavingPct, cheapestPlanWith, costAtCap, costAtUtilisation,
  netRevenue, nextPlanFor, periodResetsAt, periodStart, planHas,
} from "./plans";

describe("plan catalog", () => {
  it("orders plans by price and allowance", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lo = PLANS[PLAN_ORDER[i - 1]], hi = PLANS[PLAN_ORDER[i]];
      expect(hi.price.monthly).toBeGreaterThan(lo.price.monthly);
      for (const m of Object.keys(lo.limits) as (keyof typeof lo.limits)[]) expect(hi.limits[m]).toBeGreaterThanOrEqual(lo.limits[m]);
      for (const f of lo.features) expect(hi.features).toContain(f);
      expect(hi.watchlistMax).toBeGreaterThan(lo.watchlistMax);
    }
  });

  it("prices annual below twelve monthly payments", () => {
    expect(annualSavingPct("pro")).toBeGreaterThanOrEqual(20);
    expect(annualSavingPct("desk")).toBeGreaterThanOrEqual(20);
    expect(annualSavingPct("free")).toBe(0);
  });

  it("gates every route on a meter the catalog defines", () => {
    for (const g of Object.values(ROUTE_GATES)) {
      expect(PLANS.desk.limits[g.meter]).toBeGreaterThan(0);
      if (g.feature) expect(planHas("desk", g.feature)).toBe(true);
    }
  });

  it("offers the cheapest plan that unlocks a feature", () => {
    expect(cheapestPlanWith("debate")).toBe("pro");
    expect(cheapestPlanWith("redteam")).toBe("desk");
    expect(cheapestPlanWith("house_brief")).toBe("free");
  });

  it("suggests the next plan with a bigger allowance, or none at the top", () => {
    expect(nextPlanFor("analysis", "free")).toBe("pro");
    expect(nextPlanFor("analysis", "pro")).toBe("desk");
    expect(nextPlanFor("analysis", "desk")).toBeNull();
  });
});

describe("metering period", () => {
  it("is the calendar month in UTC", () => {
    expect(periodStart(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10-01");
    expect(periodStart(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11-01");
    expect(periodResetsAt(new Date("2026-12-15T00:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("unit economics", () => {
  it("keeps the free tier's worst case under two dollars a month", () => {
    expect(costAtCap("free")).toBeLessThan(2);
  });

  it("keeps a typical (25% utilisation) paid member above 55% gross margin on every channel", () => {
    for (const plan of ["pro", "desk"] as const) {
      const cost = costAtUtilisation(plan, 0.25);
      for (const ch of ["web", "app_store_small_business"] as const) {
        const net = netRevenue(PLANS[plan].price.monthly, ch);
        expect(1 - cost / net).toBeGreaterThan(0.55);
      }
    }
  });

  it("applies channel fees", () => {
    expect(netRevenue(19.99, "app_store")).toBeCloseTo(13.99, 2);
    expect(netRevenue(19.99, "app_store_small_business")).toBeCloseTo(16.99, 2);
    expect(netRevenue(19.99, "web")).toBeCloseTo(19.11, 2);
    expect(netRevenue(0, "web")).toBe(0);
  });
});
