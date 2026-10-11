import { describe, it, expect } from "vitest";
import {
  ago, callTone, hasTicker, ideaChatContext, itemSymbol, quoteLabel, quoteSymbols, splitCall, splitChecks,
  splitSignals, streamToBrief, triggerView, type BriefItem,
} from "./brief";

const item = (over: Partial<BriefItem> = {}): BriefItem => ({
  id: "1", name: "Taiwan Semiconductor", ticker: "TSM", cls: "Equity / Stock", horizon: "3–6 months",
  thesis: "t", signals: "s", checks: "Confirm: c · Kill: k", ...over,
});

describe("splitCall", () => {
  it("separates the verb from its reason at the first spaced or em dash", () => {
    expect(splitCall("Accumulate — capacity sold out into 2027")).toEqual({ verb: "Accumulate", reason: "capacity sold out into 2027" });
    expect(splitCall("Buy - contract cycle turning")).toEqual({ verb: "Buy", reason: "contract cycle turning" });
    expect(splitCall("Watch—duration bid")).toEqual({ verb: "Watch", reason: "duration bid" });
  });

  it("keeps hyphenated words whole and sentence-cases advice-mode capitals", () => {
    expect(splitCall("BUY — re-rate under way")).toEqual({ verb: "Buy", reason: "re-rate under way" });
    expect(splitCall("SELL")).toEqual({ verb: "Sell", reason: "" });
    expect(splitCall("")).toEqual({ verb: "", reason: "" });
  });
});

describe("callTone", () => {
  it("colours by verb", () => {
    expect(callTone("Buy — x")).toBe("pos");
    expect(callTone("Accumulate — x")).toBe("pos");
    expect(callTone("Sell — x")).toBe("neg");
    expect(callTone("Avoid — crowded")).toBe("neg");
    expect(callTone("TRIM — take some off")).toBe("warn");
    expect(callTone("HOLD")).toBe("warn");
    expect(callTone("Watch — if CPI cools")).toBe("warn");
  });

  it("never guesses a colour for a verb it doesn't know", () => {
    expect(callTone("Consider — maybe")).toBe("neutral");
    expect(callTone(undefined)).toBe("neutral");
  });
});

describe("splitChecks", () => {
  it("pulls the confirm and kill lines apart", () => {
    expect(splitChecks("Confirm: next print holds >30% YoY · Kill: a guide-down on utilisation")).toEqual({
      confirm: "next print holds >30% YoY", kill: "a guide-down on utilisation", other: "",
    });
  });

  it("handles one side only, and either order", () => {
    expect(splitChecks("Kill: the spread closes")).toEqual({ confirm: "", kill: "the spread closes", other: "" });
    expect(splitChecks("Kill: a · Confirm: b")).toEqual({ confirm: "b", kill: "a", other: "" });
  });

  it("keeps free text that doesn't follow the shape instead of dropping it", () => {
    expect(splitChecks("Watch the next CPI print")).toEqual({ confirm: "", kill: "", other: "Watch the next CPI print" });
    expect(splitChecks("")).toEqual({ confirm: "", kill: "", other: "" });
  });
});

describe("splitSignals", () => {
  it("splits on middle dots and semicolons", () => {
    expect(splitSignals("a · b · c")).toEqual(["a", "b", "c"]);
    expect(splitSignals("one; two; three.")).toEqual(["one", "two", "three"]);
  });
  it("leaves a single clause as one item (and doesn't split hyphens)", () => {
    expect(splitSignals("peer moved +12% today — supply-chain read")).toEqual(["peer moved +12% today — supply-chain read"]);
    expect(splitSignals("")).toEqual([]);
  });
});

describe("tickers", () => {
  it("treats the model's dash as no ticker", () => {
    expect(hasTicker({ ticker: "—" })).toBe(false);
    expect(hasTicker({ ticker: " " })).toBe(false);
    expect(itemSymbol({ ticker: "—", name: "A grid-equipment maker" })).toBe("A grid-equipment maker");
    expect(itemSymbol({ ticker: "TSM", name: "Taiwan Semi" })).toBe("TSM");
  });

  it("dedupes quote symbols and skips ideas without one", () => {
    expect(quoteSymbols([item({ ticker: "tsm" }), item({ ticker: "TSM" }), item({ ticker: "—" }), item({ ticker: "CCJ" })])).toEqual(["TSM", "CCJ"]);
  });
});

describe("streamToBrief", () => {
  it("returns null until there's an intro or an idea", () => {
    expect(streamToBrief("")).toBeNull();
    expect(streamToBrief("===INTRO===")).toBeNull();
  });

  it("maps streamed ideas, keeping advice-mode levels and the confirm/kill lines", () => {
    const text = [
      "===INTRO===", "Rates eased.",
      "@@OPP@@", "name: Cameco", "ticker: CCJ", "class: Equity / Stock", "horizon: 6–12 months",
      "thesis: Contract cycle.", "signals: a; b", "action: BUY — turning", "entry: 48–50", "target: est. 62", "stop: 44",
      "size: 3% of the sleeve", "confirm: term price rises", "kill: restart pulled forward",
    ].join("\n");
    const b = streamToBrief(text)!;
    expect(b.intro).toBe("Rates eased.");
    expect(b.items).toHaveLength(1);
    expect(b.items[0]).toMatchObject({
      name: "Cameco", ticker: "CCJ", entry: "48–50", stop: "44", size: "3% of the sleeve",
      checks: "Confirm: term price rises · Kill: restart pulled forward",
    });
  });
});

describe("triggerView", () => {
  it("makes a breached stop the loud one", () => {
    expect(triggerView({ kind: "stop", label: "stop breached" })).toMatchObject({ tone: "neg", title: "Stop breached" });
    expect(triggerView({ kind: "stop", label: "stop breached (above)" }).body).toMatch(/above/);
    expect(triggerView({ kind: "target", label: "target reached" }).tone).toBe("pos");
    expect(triggerView({ kind: "entry", label: "in entry range" }).tone).toBe("info");
  });
});

describe("ago", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  it("formats compactly against an explicit clock", () => {
    expect(ago("2026-10-11T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-11T11:15:00Z", now)).toBe("45m ago");
    expect(ago("2026-10-11T07:00:00Z", now)).toBe("5h ago");
    expect(ago("2026-10-09T12:00:00Z", now)).toBe("2d ago");
  });
  it("says nothing without a time or a clock", () => {
    expect(ago(null, now)).toBeNull();
    expect(ago("2026-10-11T07:00:00Z", 0)).toBeNull();
    expect(ago("not a date", now)).toBeNull();
  });
});

describe("quoteLabel", () => {
  const now = 1_000_000_000;
  it("labels a delayed close as a close, with its source", () => {
    const l = quoteLabel({ price: 10, changePct: 1, live: false, source: "Stooq" }, now, now);
    expect(l.text).toBe("close");
    expect(l.live).toBe(false);
    expect(l.title).toMatch(/Delayed close via Stooq/);
  });

  it("only calls a real-time price live while it is fresh", () => {
    const q = { price: 60000, changePct: -2, live: true, source: "Coinbase" };
    expect(quoteLabel(q, now - 30_000, now)).toMatchObject({ text: "live", live: true });
    const stale = quoteLabel(q, now - 10 * 60_000, now);
    expect(stale.live).toBe(false);
    expect(stale.text).not.toBe("live");
  });
});

describe("ideaChatContext", () => {
  it("grounds the chat in what the card says", () => {
    const c = ideaChatContext(item({ thesis: "T", signals: "S", checks: "Confirm: c · Kill: k" }));
    expect(c).toMatchObject({ kind: "asset", asset: "TSM", cls: "Equity / Stock", title: "TSM", sub: "today's brief" });
    expect(c.notes).toContain("Thesis: T");
    expect(c.notes).toContain("Kill: k");
  });
});
