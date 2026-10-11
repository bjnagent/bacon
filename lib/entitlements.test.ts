import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolvePlan } from "./entitlements";

const NOW = new Date("2026-10-11T12:00:00Z");
const day = 24 * 3600 * 1000;

describe("resolvePlan", () => {
  const prev = process.env.ADMIN_EMAILS;
  beforeEach(() => { process.env.ADMIN_EMAILS = "ops@bacon.test"; });
  afterEach(() => { process.env.ADMIN_EMAILS = prev; });

  it("gives the operator the top plan, unmetered", () => {
    const s = resolvePlan({ email: "OPS@bacon.test", subscription: null, createdAt: null, now: NOW });
    expect(s).toMatchObject({ plan: "desk", source: "operator" });
  });

  it("honours a live subscription", () => {
    const s = resolvePlan({
      email: "a@b.c", now: NOW, createdAt: "2026-01-01T00:00:00Z",
      subscription: { plan: "pro", status: "active", provider: "stripe", current_period_end: new Date(NOW.getTime() + 10 * day).toISOString(), billing_interval: "month" },
    });
    expect(s).toMatchObject({ plan: "pro", source: "subscription", provider: "stripe", interval: "month" });
  });

  it("keeps access through the grace window after a period ends, then lapses", () => {
    const sub = (endOffset: number) => ({ plan: "desk", status: "active", current_period_end: new Date(NOW.getTime() + endOffset).toISOString() });
    expect(resolvePlan({ email: null, now: NOW, createdAt: null, subscription: sub(-2 * day) }).plan).toBe("desk");
    expect(resolvePlan({ email: null, now: NOW, createdAt: null, subscription: sub(-4 * day) }).plan).toBe("free");
  });

  it("drops a canceled subscription to free", () => {
    const s = resolvePlan({ email: null, now: NOW, createdAt: "2026-01-01T00:00:00Z", subscription: { plan: "pro", status: "canceled", current_period_end: null } });
    expect(s.plan).toBe("free");
  });

  it("runs new accounts on a Pro reverse trial for a week", () => {
    const fresh = resolvePlan({ email: null, now: NOW, subscription: null, createdAt: new Date(NOW.getTime() - 2 * day).toISOString() });
    expect(fresh).toMatchObject({ plan: "pro", source: "trial", status: "trialing" });
    expect(new Date(fresh.trialEndsAt!).getTime()).toBe(NOW.getTime() + 5 * day);
    const old = resolvePlan({ email: null, now: NOW, subscription: null, createdAt: new Date(NOW.getTime() - 8 * day).toISOString() });
    expect(old).toMatchObject({ plan: "free", source: "free" });
  });

  it("prefers a paid subscription over the trial", () => {
    const s = resolvePlan({ email: null, now: NOW, createdAt: NOW.toISOString(), subscription: { plan: "desk", status: "trialing", current_period_end: null } });
    expect(s).toMatchObject({ plan: "desk", source: "subscription" });
  });
});
