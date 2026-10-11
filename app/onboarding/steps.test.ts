import { describe, expect, it } from "vitest";
import { guessClass, normaliseSymbol, saveEach } from "./steps";

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

describe("normaliseSymbol", () => {
  it("accepts real symbol shapes", () => {
    expect(normaliseSymbol(" brk.b ")).toBe("BRK.B");
    expect(normaliseSymbol("btc-usd")).toBe("BTC-USD");
    expect(normaliseSymbol("EURUSD=X")).toBe("EURUSD=X");
    expect(normaliseSymbol("^gspc")).toBe("^GSPC");
    expect(normaliseSymbol("7203.T")).toBe("7203.T");
  });
  it("rejects prose and punctuation", () => {
    expect(normaliseSymbol("nvda!")).toBeNull();
    expect(normaliseSymbol("")).toBeNull();
    expect(normaliseSymbol("-ABC")).toBeNull();
    expect(normaliseSymbol("A".repeat(25))).toBeNull();
  });
});

describe("guessClass", () => {
  it("reads the class from the symbol's shape", () => {
    expect(guessClass("EURUSD=X")).toBe("FX / Currency pair");
    expect(guessClass("ETH-USD")).toBe("Crypto");
    expect(guessClass("SPY")).toBe("ETF / Fund");
    expect(guessClass("BRK.B")).toBe("Equity / Stock");
  });
});

describe("saveEach", () => {
  it("saves everything, counting duplicates as saved", async () => {
    const saved: string[] = [];
    const r = await saveEach(["a", "b", "c"], async (x) => { if (x === "b") throw new HttpError(409, "Already added"); }, (x) => saved.push(x));
    expect(r).toEqual({ limit: null, error: null });
    expect(saved).toEqual(["a", "b", "c"]);
  });

  it("stops at the plan cap and reports it", async () => {
    const posted: string[] = [];
    const saved: string[] = [];
    const r = await saveEach(
      ["a", "b", "c"],
      async (x) => { posted.push(x); if (x === "b") throw new HttpError(402, "You're tracking 5 of 5 names on Free."); },
      (x) => saved.push(x),
    );
    expect(r.limit).toMatch(/5 of 5/);
    expect(r.error).toBeNull();
    expect(saved).toEqual(["a"]);
    expect(posted).toEqual(["a", "b"]); // never tried "c"
  });

  it("stops on any other error so it can be retried", async () => {
    const saved: string[] = [];
    const r = await saveEach(["a", "b"], async (x) => { if (x === "a") throw new HttpError(500, "Couldn't add that — try again."); }, (x) => saved.push(x));
    expect(r.error).toMatch(/try again/);
    expect(saved).toEqual([]);
  });
});
