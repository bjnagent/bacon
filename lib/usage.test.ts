import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { estimateCostUsd } from "./usage";
import { isAdminEmail } from "./admin";

describe("estimateCostUsd", () => {
  it("prices plain input/output at the model's rate", () => {
    // Sonnet 4-6: $3/1M in, $15/1M out.
    const r = estimateCostUsd("claude-sonnet-4-6", { input: 1_000_000, output: 1_000_000 });
    expect(r.priced).toBe(true);
    expect(r.costUsd).toBeCloseTo(18, 6);
  });

  it("resolves dated model IDs by longest prefix", () => {
    const a = estimateCostUsd("claude-sonnet-4-6-20260101", { input: 1_000_000, output: 0 });
    expect(a.costUsd).toBeCloseTo(3, 6);
    // opus-4-8 must not fall back to a shorter "claude-opus" style match.
    const b = estimateCostUsd("claude-opus-4-8-20260101", { input: 1_000_000, output: 0 });
    expect(b.costUsd).toBeCloseTo(5, 6);
  });

  it("bills cache reads at 0.1x and writes at 1.25x the input rate", () => {
    const r = estimateCostUsd("claude-sonnet-4-6", { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 });
    expect(r.costUsd).toBeCloseTo(3 * 0.1 + 3 * 1.25, 6);
  });

  it("adds server-side search at the provider's own per-search rate", () => {
    // Anthropic: $10/1k searches. 6 searches on an analyze run = $0.06 —
    // more than the token cost of a small call, which is why it's metered.
    const claude = estimateCostUsd("claude-sonnet-4-6", { input: 0, output: 0, webSearches: 6 });
    expect(claude.costUsd).toBeCloseTo(0.06, 6);
    // xAI Live Search is $25/1k sources — a different rate, not Anthropic's.
    const grok = estimateCostUsd("grok-3-mini", { input: 0, output: 0, webSearches: 6 });
    expect(grok.costUsd).toBeCloseTo(0.15, 6);
  });

  it("marks an unknown model unpriced instead of reporting a confident $0", () => {
    const r = estimateCostUsd("some-new-model-v9", { input: 500_000, output: 500_000 });
    expect(r.priced).toBe(false);
    expect(r.costUsd).toBe(0);
  });

  it("rounds to the ledger column's 6dp", () => {
    const r = estimateCostUsd("claude-haiku-4-5", { input: 1, output: 1 });
    // $1/1M + $5/1M on single tokens = 0.000006
    expect(r.costUsd).toBe(0.000006);
    expect(String(r.costUsd).replace(/^0\.?/, "").length).toBeLessThanOrEqual(6);
  });

  it("treats a zero-token call as free, not as an error", () => {
    expect(estimateCostUsd("claude-sonnet-4-6", { input: 0, output: 0 })).toEqual({ costUsd: 0, priced: true });
  });
});

describe("isAdminEmail", () => {
  const saved = process.env.ADMIN_EMAILS;
  beforeEach(() => { process.env.ADMIN_EMAILS = " Ops@Bacon.app , second@bacon.app "; });
  afterEach(() => { if (saved === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = saved; });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(isAdminEmail("ops@bacon.app")).toBe(true);
    expect(isAdminEmail("OPS@BACON.APP")).toBe(true);
    expect(isAdminEmail("second@bacon.app")).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isAdminEmail("someone@bacon.app")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("fails CLOSED when the allowlist is unset or empty", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("ops@bacon.app")).toBe(false);
    process.env.ADMIN_EMAILS = "   ";
    expect(isAdminEmail("ops@bacon.app")).toBe(false);
  });
});
