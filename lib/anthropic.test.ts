import { describe, it, expect } from "vitest";
import { thinkingFor, outputCap, MODEL, BULK_MODEL } from "./anthropic";

describe("model defaults", () => {
  it("run on the 5.5 generation unless pinned by env", () => {
    if (!process.env.BACON_MODEL) expect(MODEL).toBe("claude-sonnet-5-5");
    if (!process.env.BACON_BULK_MODEL) expect(BULK_MODEL).toBe("claude-haiku-5-5");
  });
});

describe("thinkingFor — the thinking-off spelling each model accepts", () => {
  it("Sonnet 5.5: between_tools (disabled is a 400), effort high or below, no other thinking field", () => {
    const k = thinkingFor("claude-sonnet-5-5");
    expect(k.thinking).toEqual({ type: "between_tools" });
    expect(["low", "medium", "high"]).toContain(k.output_config?.effort);
  });
  it("Haiku 5.5: disabled, with an explicit effort of high or below", () => {
    const k = thinkingFor("claude-haiku-5-5");
    expect(k.thinking).toEqual({ type: "disabled" });
    expect(["low", "medium", "high"]).toContain(k.output_config?.effort);
  });
  it("Opus 5.5 / Fable: never sends a thinking field (it can't be disabled)", () => {
    expect(thinkingFor("claude-opus-5-5").thinking).toBeUndefined();
    expect(thinkingFor("claude-fable-5-1").thinking).toBeUndefined();
  });
  it("older generations keep their forms", () => {
    expect(thinkingFor("claude-sonnet-5").thinking).toEqual({ type: "disabled" });
    expect(thinkingFor("claude-sonnet-4-6").thinking).toEqual({ type: "disabled" });
    expect(thinkingFor("claude-haiku-4-5")).toEqual({});
  });
});

describe("outputCap", () => {
  it("scales caps for Haiku 5.5's larger token counts only", () => {
    expect(outputCap("claude-haiku-5-5", 1800)).toBe(2340);
    expect(outputCap("claude-sonnet-5-5", 1800)).toBe(1800);
  });
});
