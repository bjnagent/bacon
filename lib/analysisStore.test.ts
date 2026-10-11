import { describe, it, expect } from "vitest";
import {
  SHARED_TTL_MS, REOPEN_TTL_MS, symbolKey, cacheKey, isPersonal, matchesSymbol, isFresh,
  isShareableRow, pickShared, pickOwn, copyRow, newRow, toStored, listItem, mergeExtras,
  parseExtrasPatch, cleanToolResult, encodeMeta, splitStream, leanOf, callOf, stancesOf,
  isUsableBriefing, isCompleteBriefing, readMeta, isUuid,
  type AnalysisRow, type AnalysisMeta,
} from "./analysisStore";
import { parseBriefing } from "./parsers";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

// Illustrative fixture text — the parser's shape, not market facts.
const lens = (k: string, stance: string) => `===${k}===\n[${stance}] A read.\nVerify: a filing`;
const BRIEF = [
  "===SUMMARY===\nTwo sentence synthesis.",
  lens("FUNDAMENTAL", "Constructive"), lens("VALUATION", "Mixed"), lens("TECHNICAL", "Constructive"),
  lens("HEALTH", "Constructive"), lens("FACTOR", "Mixed"), lens("MACRO", "Cautious"),
  lens("SIGNALS", "Mixed"), lens("RISK", "Cautious"),
  "===VERDICT===\nBuy · conviction 4/5\n12-mo estimates: bear est. -10%, base est. +8%, bull est. +20%",
  "===BOTTOMLINE===\nThe call in plain words.",
].join("\n");

function row(p: Partial<AnalysisRow> = {}): AnalysisRow {
  return {
    id: "11111111-1111-4111-8111-111111111111", user_id: "u1", symbol: "NVDA", query: "nvda",
    asset_class: "Equity / Stock", content: BRIEF, extras: { meta: { verified: true, resolved: null, gaps: [] } },
    personal: false, shared_from: null, created_at: ago(H), ...p,
  };
}

describe("symbolKey / cacheKey", () => {
  it("normalises case, whitespace, pair slashes and a leading $", () => {
    expect(symbolKey(" nvda ")).toBe("NVDA");
    expect(symbolKey("usd/jpy")).toBe("USDJPY");
    expect(symbolKey("USD JPY")).toBe("USDJPY");
    expect(symbolKey("$tsla")).toBe("TSLA");
    expect(symbolKey("brk.b")).toBe("BRK.B");
    expect(symbolKey("BTC-USD")).toBe("BTC-USD");
    expect(symbolKey(null)).toBe("");
  });

  it("keys a verified resolution by the listed symbol, anything else by what was typed", () => {
    expect(cacheKey("Nike", { symbol: "NKE", verified: true })).toBe("NKE");
    expect(cacheKey("Nike", { symbol: "NIKE", verified: false })).toBe("NIKE");
    // cleanTicker would return "USD" here — every dollar pair would collide.
    expect(cacheKey("USD/JPY", { symbol: "USD", verified: false })).toBe("USDJPY");
    expect(cacheKey("EUR/USD", { symbol: "EUR", verified: false })).not.toBe(cacheKey("EUR/GBP", { symbol: "EUR", verified: false }));
  });

  it("matches a row by its filed key or by what was typed", () => {
    expect(matchesSymbol({ symbol: "NKE", query: "Nike" }, "NIKE")).toBe(true);
    expect(matchesSymbol({ symbol: "NKE", query: "Nike" }, "nke")).toBe(true);
    expect(matchesSymbol({ symbol: "USDJPY", query: "USD/JPY" }, "USD/JPY")).toBe(true);
    expect(matchesSymbol({ symbol: "NVDA", query: "NVDA" }, "AMD")).toBe(false);
    expect(matchesSymbol({ symbol: "NVDA", query: "NVDA" }, "")).toBe(false);
  });
});

describe("personal + freshness", () => {
  it("is personal when either memo carries anything", () => {
    expect(isPersonal("", "")).toBe(false);
    expect(isPersonal("  ", null)).toBe(false);
    expect(isPersonal("12 graded calls", "")).toBe(true);
    expect(isPersonal("", "\n\n- 2026-01-02: you called buy")).toBe(true);
  });

  it("checks age against a ttl with a little clock-skew tolerance", () => {
    expect(isFresh(ago(5 * H), SHARED_TTL_MS, NOW)).toBe(true);
    expect(isFresh(ago(7 * H), SHARED_TTL_MS, NOW)).toBe(false);
    expect(isFresh(ago(-30_000), SHARED_TTL_MS, NOW)).toBe(true);
    expect(isFresh(ago(-10 * 60_000), SHARED_TTL_MS, NOW)).toBe(false);
    expect(isFresh("not a date", SHARED_TTL_MS, NOW)).toBe(false);
  });
});

describe("briefing quality", () => {
  it("separates renderable from shareable", () => {
    const full = parseBriefing(BRIEF);
    expect(isUsableBriefing(full)).toBe(true);
    expect(isCompleteBriefing(full)).toBe(true);
    const partial = parseBriefing("===SUMMARY===\nOnly a summary.");
    expect(isUsableBriefing(partial)).toBe(true);
    expect(isCompleteBriefing(partial)).toBe(false);
    expect(isUsableBriefing(parseBriefing("I couldn't do that."))).toBe(false);
  });
});

describe("cache eligibility", () => {
  it("shares only fresh, non-personal, complete originals without data gaps", () => {
    expect(isShareableRow(row(), NOW)).toBe(true);
    expect(isShareableRow(row({ personal: true }), NOW)).toBe(false);
    expect(isShareableRow(row({ shared_from: "x" }), NOW)).toBe(false);
    expect(isShareableRow(row({ created_at: ago(7 * H) }), NOW)).toBe(false);
    expect(isShareableRow(row({ content: "===SUMMARY===\nThin." }), NOW)).toBe(false);
    expect(isShareableRow(row({ extras: { meta: { verified: false, resolved: null, gaps: ["no_price"] } } }), NOW)).toBe(false);
  });

  it("picks the newest shareable candidate, skipping a newer gapped one", () => {
    const gapped = row({ id: "new", created_at: ago(H / 2), extras: { meta: { verified: true, resolved: null, gaps: ["no_fundamentals"] } } });
    const good = row({ id: "older", created_at: ago(2 * H) });
    const oldest = row({ id: "oldest", created_at: ago(3 * H) });
    expect(pickShared([oldest, gapped, good], NOW)?.id).toBe("older");
    expect(pickShared([], NOW)).toBeNull();
  });

  it("picks the member's own newest usable run by symbol, class and age", () => {
    const rows = [
      row({ id: "a", symbol: "NKE", query: "Nike", created_at: ago(2 * H) }),
      row({ id: "b", symbol: "NKE", query: "Nike", created_at: ago(30 * H) }),
      row({ id: "c", symbol: "NKE", query: "NKE", created_at: ago(H), content: "garbage" }),
      row({ id: "d", symbol: "GOLD", query: "gold", asset_class: "Commodity", created_at: ago(H) }),
    ];
    expect(pickOwn(rows, "NIKE", null, REOPEN_TTL_MS, NOW)?.id).toBe("a");
    expect(pickOwn(rows, "NKE", "Equity / Stock", REOPEN_TTL_MS, NOW)?.id).toBe("a");
    expect(pickOwn(rows, "GOLD", "Equity / Stock", REOPEN_TTL_MS, NOW)).toBeNull();
    expect(pickOwn(rows, "GOLD", "commodity", REOPEN_TTL_MS, NOW)?.id).toBe("d");
    expect(pickOwn(rows, "NKE", null, H / 2, NOW)).toBeNull();
  });
});

describe("row shaping", () => {
  it("files a new run under its key with the data facts in extras.meta", () => {
    const r = newRow({ id: "i", userId: "u", key: "NKE", query: "Nike", assetClass: "stock", content: BRIEF, personal: true, meta: { verified: true, resolved: "NKE", gaps: [] } });
    expect(r).toMatchObject({ id: "i", user_id: "u", symbol: "NKE", query: "Nike", asset_class: "Equity / Stock", personal: true });
    expect(r.extras.meta?.resolved).toBe("NKE");
  });

  it("copies a hit without the original member's deep-tool results, keeping its age", () => {
    const hit = row({ extras: { meta: { verified: true, resolved: null, gaps: [] }, debate: { BULL: "x" } } });
    const c = copyRow(hit, "u2", "NVDA");
    expect(c.user_id).toBe("u2");
    expect(c.shared_from).toBe(hit.id);
    expect(c.created_at).toBe(hit.created_at);
    expect(c.personal).toBe(false);
    expect(c.extras).toEqual({ meta: { verified: true, resolved: null, gaps: [] } });
  });

  it("shapes a stored analysis for the client", () => {
    const s = toStored(row({ shared_from: "orig", extras: { meta: { verified: true, resolved: null, gaps: ["no_price"] }, redteam: { RISKS: "1. x" } } }), "own");
    expect(s.meta).toMatchObject({ symbol: "NVDA", cache: "own", shared: true, gaps: ["no_price"] });
    expect(s.extras).toEqual({ redteam: { RISKS: "1. x" } });
  });

  it("lists a row with its lean and call derived from the briefing", () => {
    expect(listItem(row())).toMatchObject({ symbol: "NVDA", lean: "constructive", call: "Buy" });
    expect(listItem(row({ content: "nothing parseable" }))).toMatchObject({ lean: null, call: null });
  });

  it("reads meta defensively", () => {
    expect(readMeta(null)).toEqual({ verified: false, resolved: null, gaps: [] });
    expect(readMeta({ meta: { verified: true, resolved: "", gaps: ["no_price", "bogus"] } })).toEqual({ verified: true, resolved: null, gaps: ["no_price"] });
  });
});

describe("deep-tool extras", () => {
  it("accepts only the four tool keys with section-shaped results", () => {
    expect(parseExtrasPatch({ debate: { BULL: "a", BEAR: "b" } })).toEqual({ debate: { BULL: "a", BEAR: "b" } });
    expect(parseExtrasPatch({ meta: { verified: true } })).toBeNull();
    expect(parseExtrasPatch({ debate: "text" })).toBeNull();
    expect(parseExtrasPatch({})).toBeNull();
    expect(parseExtrasPatch(null)).toBeNull();
    expect(cleanToolResult({ bull: "lower-case keys are not sections", OK: 3 })).toBeNull();
  });

  it("merges without dropping meta or other tools", () => {
    const merged = mergeExtras({ meta: { verified: true, resolved: null, gaps: [] }, debate: { BULL: "a" } }, { chain: { MAP: "m" } });
    expect(merged).toEqual({ meta: { verified: true, resolved: null, gaps: [] }, debate: { BULL: "a" }, chain: { MAP: "m" } });
    expect(mergeExtras(null, { personas: { BUFFETT: "b" } })).toEqual({ personas: { BUFFETT: "b" } });
  });

  it("recognises uuids", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("1; drop table")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("the meta line", () => {
  const meta: AnalysisMeta = {
    id: "i", symbol: "NVDA", query: "nvda", assetClass: "Equity / Stock", generatedAt: ago(0),
    cache: "miss", shared: false, verified: true, resolved: null, gaps: [],
  };

  it("round-trips and leaves the briefing parseable", () => {
    const { meta: m, body } = splitStream(encodeMeta(meta) + BRIEF);
    expect(m).toEqual(meta);
    expect(body).toBe(BRIEF);
    expect(parseBriefing(encodeMeta(meta) + BRIEF).SUMMARY).toBe("Two sentence synthesis.");
  });

  it("waits for the line to finish, passes plain text through and strips the error marker", () => {
    expect(splitStream('@@bacon-meta {"id":"i"')).toEqual({ meta: null, body: "" });
    expect(splitStream("===SUMMARY===\nx")).toEqual({ meta: null, body: "===SUMMARY===\nx" });
    expect(splitStream(encodeMeta(meta) + "===SUMMARY===\nx\n\n[error: overloaded]").body).toBe("===SUMMARY===\nx");
  });
});

describe("lean + call", () => {
  it("follows lib/lenses' voting rule and treats a missing lens as limited data", () => {
    const st = stancesOf(parseBriefing(BRIEF));
    expect(st.MACRO).toBe("cautious");
    expect(leanOf(st)).toBe("constructive");
    expect(leanOf({ ...st, HEALTH: "mixed", MACRO: "mixed" })).toBe("tilts-constructive");
    expect(stancesOf(parseBriefing("===SUMMARY===\nx")).RISK).toBe("limited-data");
    expect(leanOf({ FUNDAMENTAL: "constructive", VALUATION: "constructive", TECHNICAL: "constructive" })).toBe("constructive");
    expect(leanOf({ MACRO: "cautious", RISK: "cautious", FACTOR: "cautious", HEALTH: "constructive" })).toBe("cautious");
    expect(leanOf({})).toBe("mixed");
  });

  it("reads the call word from the verdict's first line", () => {
    expect(callOf("Buy · conviction 4/5\n...")).toBe("Buy");
    expect(callOf("**Sell** · conviction 2/5")).toBe("Sell");
    expect(callOf("hold — wait for earnings")).toBe("Hold");
    expect(callOf("Proceed smaller")).toBeNull();
    expect(callOf(undefined)).toBeNull();
  });
});
