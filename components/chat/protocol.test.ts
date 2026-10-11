import { describe, it, expect } from "vitest";
import { ago, contextKey, contextLabel, introTitle, isUuid, normalizeHistory, sameContext, sanitizeContext, stripErrorMarker, uuid } from "./protocol";
import { keyboardFit } from "./useKeyboardFit";

describe("normalizeHistory", () => {
  it("keeps known roles, trims, drops empties and non-objects", () => {
    expect(normalizeHistory([{ role: "user", content: "  hi " }, null, { role: "assistant", content: "" }, { role: "system", content: "x" }, "nope"]))
      .toEqual([{ role: "user", content: "hi\n\nx" }]);
  });

  it("merges consecutive same-role turns (a failed or stopped turn leaves two questions in a row)", () => {
    expect(normalizeHistory([
      { role: "user", content: "first" },
      { role: "user", content: "second" },
      { role: "assistant", content: "answer" },
    ])).toEqual([{ role: "user", content: "first\n\nsecond" }, { role: "assistant", content: "answer" }]);
  });

  it("keeps the most recent turns and always starts on a user turn", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    const out = normalizeHistory(many, 5);
    expect(out[0].role).toBe("user");
    expect(out.length).toBe(4);
    expect(out[out.length - 1].content).toBe("m29");
  });

  it("caps each message", () => {
    expect(normalizeHistory([{ role: "user", content: "x".repeat(50) }], 24, 10)[0].content).toHaveLength(10);
  });

  it("returns [] for anything that isn't an array", () => {
    expect(normalizeHistory("x")).toEqual([]);
    expect(normalizeHistory(undefined)).toEqual([]);
  });
});

describe("sanitizeContext", () => {
  it("keeps known fields, caps them, and drops unknown keys", () => {
    const ctx = sanitizeContext({ kind: "asset", asset: "NVDA", title: "NVDA", notes: "n".repeat(10_000), evil: "<script>", assets: ["A", 3, "B"] });
    expect(ctx).toMatchObject({ kind: "asset", asset: "NVDA", title: "NVDA", assets: ["A", "B"] });
    expect(ctx?.notes).toHaveLength(6000);
    expect(ctx).not.toHaveProperty("evil");
  });

  it("falls back to a general context for an unknown kind, and null for junk", () => {
    expect(sanitizeContext({ kind: "root" })).toEqual({ kind: "general" });
    expect(sanitizeContext("x")).toBeNull();
    expect(sanitizeContext(null)).toBeNull();
  });
});

describe("contextKey / sameContext", () => {
  it("treats the same name as one conversation wherever it was opened from", () => {
    expect(sameContext({ kind: "asset", asset: "nvda", sub: "multi-lens analysis" }, { kind: "tracked", asset: "NVDA", notes: "x" })).toBe(true);
    expect(sameContext({ kind: "asset", asset: "NVDA" }, { kind: "asset", asset: "AAPL" })).toBe(false);
  });

  it("keys news by headline and broad views by kind", () => {
    expect(contextKey({ kind: "news", headline: "Fed holds" })).toBe("news:Fed holds");
    expect(sameContext({ kind: "radar", assets: ["A"] }, { kind: "radar", assets: ["A", "B"] })).toBe(true);
    expect(sameContext(null, { kind: "general" })).toBe(true);
    expect(sameContext({ kind: "general" }, { kind: "news-feed" })).toBe(false);
  });
});

describe("copy helpers", () => {
  it("labels the header in sentence case", () => {
    expect(contextLabel({ kind: "asset", title: "NVDA", sub: "multi-lens analysis" })).toEqual({ title: "NVDA", sub: "Multi-lens analysis" });
    expect(contextLabel(null)).toEqual({ title: "Ask Bacon", sub: "Open discussion" });
  });

  it("titles the empty state for the context", () => {
    expect(introTitle({ kind: "asset", title: "NVDA" })).toBe("Ask about NVDA");
    expect(introTitle({ kind: "radar" })).toBe("Ask about your watchlist");
    expect(introTitle(null)).toBe("What are you researching?");
  });

  it("says how long ago a conversation was", () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    expect(ago("2026-10-11T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-11T11:15:00Z", now)).toBe("45 min ago");
    expect(ago("2026-10-11T07:00:00Z", now)).toBe("5 hr ago");
    expect(ago("2026-10-10T09:00:00Z", now)).toBe("yesterday");
    expect(ago("2026-10-08T12:00:00Z", now)).toBe("3 days ago");
    expect(ago(null, now)).toBe("");
    expect(ago("not a date", now)).toBe("");
  });
});

describe("wire helpers", () => {
  it("strips the server's mid-stream failure marker", () => {
    expect(stripErrorMarker("Partial answer\n\n[error: stream failed]")).toBe("Partial answer");
    expect(stripErrorMarker("No marker [error: inline] here")).toBe("No marker [error: inline] here");
  });

  it("mints ids the uuid column accepts, and rejects ones it wouldn't", () => {
    const id = uuid();
    expect(isUuid(id)).toBe(true);
    expect(new Set(Array.from({ length: 20 }, uuid)).size).toBe(20);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe("keyboardFit", () => {
  const vv = (height: number, offsetTop = 0, scale = 1) => ({ height, offsetTop, scale });

  it("leaves the sheet alone without a keyboard, or when zoomed", () => {
    expect(keyboardFit(vv(844), 844, 47)).toBeNull();
    expect(keyboardFit(vv(780), 844, 47)).toBeNull(); // browser chrome, not a keyboard
    expect(keyboardFit(vv(400, 0, 2), 844, 47)).toBeNull();
  });

  it("pins the sheet to the visible area above the keyboard", () => {
    // Keyboard covers 336px; Safari has panned the page up by 120px.
    expect(keyboardFit(vv(508, 120), 844, 47)).toEqual({ top: 128, height: 500 });
  });

  it("never slides under the status bar", () => {
    expect(keyboardFit(vv(508, 0), 844, 47)).toEqual({ top: 47, height: 461 });
  });
});
