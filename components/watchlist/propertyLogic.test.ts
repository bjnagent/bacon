import { describe, it, expect } from "vitest";
import { money, pct, marketLevel, quarterLabel, outlookStance, toOutlook, todayYmd, validateProperty, type Market } from "./propertyLogic";

const market = (over: Partial<Market> = {}): Market => ({
  key: "sg-hdb", label: "Singapore — HDB resale", country: "SG", currency: "SGD", unit: "index", source: "HDB via data.gov.sg",
  stats: { latest: { date: "2026-06-30", close: 182.34 }, qoqPct: 1.2, yoyPct: 4.5, spark: [170, 182.34] },
  ...over,
});

describe("formatting", () => {
  it("formats money and signed percentages", () => {
    expect(money(612000, "SGD")).toBe("SGD 612,000");
    expect(money(NaN, "SGD")).toBe("—");
    expect(pct(4.5)).toBe("+4.5%");
    expect(pct(-1.25, 2)).toBe("−1.25%");
    expect(pct(null)).toBe("—");
  });
  it("shows an index as a level and a price in its currency", () => {
    expect(marketLevel(market())).toBe("182.3");
    expect(marketLevel(market({ unit: "price", currency: "AUD", stats: { latest: { date: "2026-03-31", close: 1_150_000 }, qoqPct: null, yoyPct: null, spark: [] } }))).toBe("AUD 1,150,000");
  });
  it("never shows a level when the source returned nothing", () => {
    expect(marketLevel(market({ stats: null }))).toBeNull();
  });
  it("labels quarters", () => {
    expect(quarterLabel("2026-06-30")).toBe("Q2 2026");
    expect(quarterLabel("2025-12-31")).toBe("Q4 2025");
  });
});

describe("outlook", () => {
  it("reads the stance from the verdict's head word", () => {
    expect(outlookStance({ verdict: "Buy — supply is tight", stance: "mixed" }).tone).toBe("pos");
    expect(outlookStance({ verdict: "Avoid for now", stance: "mixed" }).tone).toBe("neg");
    expect(outlookStance({ verdict: "Hold", stance: "constructive" }).tone).toBe("warn");
    expect(outlookStance({ verdict: "", stance: "cautious" }).label).toBe("Cautious");
  });
  it("parses a streamed outlook once the read exists, and not before", () => {
    expect(toOutlook("===POLICY===\nCooling measures")).toBeNull();
    const o = toOutlook("===READ===\nSteady.\n===RATES===\nEasing.\n===VERDICT===\nBuy — on dips\n===CONFIRM===\nVolumes up\n===KILL===\nNew curbs")!;
    expect(o.read).toBe("Steady.");
    expect(o.rates).toBe("Easing.");
    expect(o.stance).toBe("constructive");
    expect(o.confirm).toBe("Volumes up");
    expect(o.kill).toBe("New curbs");
  });
});

describe("validateProperty", () => {
  const ok = { label: "Tampines 4-room", market_key: "sg-hdb", purchase_price: "612,000", purchase_date: "2019-05-01" };
  it("accepts a complete past purchase", () => {
    expect(validateProperty(ok, "2026-10-11")).toEqual({});
  });
  it("flags each missing or impossible field", () => {
    const e = validateProperty({ label: " ", market_key: "", purchase_price: "-5", purchase_date: "2030-01-01" }, "2026-10-11");
    expect(Object.keys(e).sort()).toEqual(["label", "market_key", "purchase_date", "purchase_price"]);
  });
  it("formats today's date for the date input", () => {
    expect(todayYmd(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
