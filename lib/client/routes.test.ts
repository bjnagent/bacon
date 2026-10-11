import { describe, it, expect } from "vitest";
import { parsePath, isAppPath, paths } from "./routes";

describe("app routes", () => {
  it("maps every path to a screen", () => {
    expect(parsePath("/")).toEqual({ tab: "today", sub: "brief" });
    expect(parsePath("/news")).toEqual({ tab: "today", sub: "news" });
    expect(parsePath("/watchlist")).toEqual({ tab: "watchlist", sub: "names" });
    expect(parsePath("/property")).toEqual({ tab: "watchlist", sub: "property" });
    expect(parsePath("/analyze")).toEqual({ tab: "analyze" });
    expect(parsePath("/analyze/nvda")).toEqual({ tab: "analyze", symbol: "NVDA" });
    expect(parsePath("/analyze/EUR%2FUSD")).toEqual({ tab: "analyze", symbol: "EUR/USD" });
    expect(parsePath("/track-record")).toEqual({ tab: "record" });
    expect(parsePath("/account/plan")).toEqual({ tab: "account", sub: "plan" });
  });

  it("round-trips symbols through the URL", () => {
    expect(parsePath(paths.analyze("eur/usd"))).toEqual({ tab: "analyze", symbol: "EUR/USD" });
  });

  it("only claims the paths the shell renders", () => {
    expect(isAppPath("/")).toBe(true);
    expect(isAppPath("/analyze/NVDA")).toBe(true);
    expect(isAppPath("/analyze/NVDA/extra")).toBe(false);
    expect(isAppPath("/nope")).toBe(false);
    expect(isAppPath("/watchlist/x")).toBe(false);
  });
});
