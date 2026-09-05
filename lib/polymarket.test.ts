import { describe, it, expect } from "vitest";
import { oddsEnabled } from "./polymarket";

describe("oddsEnabled", () => {
  it("is on unless explicitly disabled", () => {
    delete process.env.POLYMARKET_ENABLED;
    expect(oddsEnabled()).toBe(true);
    process.env.POLYMARKET_ENABLED = "true";
    expect(oddsEnabled()).toBe(true);
  });
  // An off switch that needs no deploy, because this surfaces prediction-market
  // data in a financial product and that should be reversible in one setting.
  it("can be switched off without a deploy", () => {
    process.env.POLYMARKET_ENABLED = "false";
    expect(oddsEnabled()).toBe(false);
    delete process.env.POLYMARKET_ENABLED;
  });
});
