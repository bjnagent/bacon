import { describe, it, expect } from "vitest";
import { explicitLean, fromParsed, fromRow, matchesFilter, newsFilters, recencyLabel, signalLean, tagLabel, type Headline } from "./news";

const h = (signal: string, over: Partial<Headline> = {}): Headline => ({
  key: signal, head: "h", source: "Reuters", why: "w", ticker: "TSM", cls: "Equity", signal, when: "2h", createdAt: null,
  lean: signalLean(signal), ...over,
});

describe("explicit lean", () => {
  it("prefers the model's lean line over the tag, and treats neutral as none", () => {
    expect(explicitLean("Constructive")).toBe("constructive");
    expect(explicitLean("cautious")).toBe("cautious");
    expect(explicitLean("neutral")).toBeNull();
    expect(explicitLean(undefined)).toBeNull();
    const row = { headline: "x", source: "FT", why: "w", symbol: "TSM", asset_class: "Equity", signal: "Earnings", recency: "2h" };
    expect(fromRow({ ...row, lean: "cautious" }, 0).lean).toBe("cautious");
    // Older batches (no lean column) still read direction from the tag.
    expect(fromRow({ ...row, signal: "Upgrade" }, 0).lean).toBe("constructive");
    expect(fromRow(row, 0).lean).toBeNull();
  });

  it("filters an Earnings headline by its explicit lean", () => {
    expect(matchesFilter(h("Earnings", { lean: "constructive" }), "constructive")).toBe(true);
  });
});

describe("signalLean", () => {
  it("reads direction only from tags that carry one", () => {
    expect(signalLean("constructive")).toBe("constructive");
    expect(signalLean("Upgrade")).toBe("constructive");
    expect(signalLean("cautious")).toBe("cautious");
    expect(signalLean("Downgrade")).toBe("cautious");
  });
  it("leaves type-only tags unclassified rather than guessing", () => {
    expect(signalLean("Earnings")).toBeNull();
    expect(signalLean("Macro")).toBeNull();
    expect(signalLean("Guidance")).toBeNull();
    expect(signalLean("")).toBeNull();
  });
});

describe("newsFilters", () => {
  it("always offers All · Constructive · Cautious, then any directionless tags present", () => {
    const f = newsFilters([h("constructive"), h("Upgrade"), h("cautious"), h("Earnings"), h("Earnings"), h("Macro")]);
    expect(f.map((x) => x.label)).toEqual(["All", "Constructive", "Cautious", "Earnings", "Macro"]);
    expect(f.map((x) => x.count)).toEqual([6, 2, 1, 2, 1]);
  });

  it("filters by lean or tag", () => {
    expect(matchesFilter(h("Upgrade"), "constructive")).toBe(true);
    expect(matchesFilter(h("Earnings"), "constructive")).toBe(false);
    expect(matchesFilter(h("Earnings"), "tag:Earnings")).toBe(true);
    expect(matchesFilter(h("Macro"), "all")).toBe(true);
  });
});

describe("tagLabel", () => {
  it("sentence-cases lower-case tags and leaves acronyms alone", () => {
    expect(tagLabel("constructive")).toBe("Constructive");
    expect(tagLabel("M&A")).toBe("M&A");
    expect(tagLabel("—")).toBe("");
  });
});

describe("recencyLabel", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  it("turns the model's short form into a phrase", () => {
    expect(recencyLabel("2h", null, now)).toBe("2h ago");
    expect(recencyLabel("today", null, now)).toBe("today");
  });
  it("falls back to the stored timestamp, never an invented time", () => {
    expect(recencyLabel("—", "2026-10-11T09:00:00Z", now)).toBe("3h ago");
    expect(recencyLabel("", null, now)).toBeNull();
  });
});

describe("row mapping", () => {
  it("maps both the cached rows and a fresh batch to one shape", () => {
    const a = fromRow({ id: "x", headline: "H", source: "FT", why: "W", symbol: "CCJ", asset_class: "Equity / Stock", signal: "constructive", recency: "6h", created_at: "2026-10-11T06:00:00Z" }, 0);
    const b = fromParsed({ head: "H", source: "FT", why: "W", ticker: "CCJ", cls: "Equity / Stock", signal: "constructive", when: "6h" }, 0, "2026-10-11T06:00:00Z");
    const { key: _ka, ...ra } = a;
    const { key: _kb, ...rb } = b;
    void _ka; void _kb;
    expect(ra).toEqual(rb);
  });
});
