import { describe, it, expect } from "vitest";
import { textStreamResponse } from "./streamRoute";

async function* good(): AsyncGenerator<string> { yield "a"; yield "b"; yield "c"; }
async function* bad(): AsyncGenerator<string> { yield "a"; throw new Error("boom"); }

describe("textStreamResponse", () => {
  it("streams the full text and reports ok=true on clean completion", async () => {
    let seen: { full: string; ok: boolean } | null = null;
    const res = textStreamResponse(good(), async (full, ok) => { seen = { full, ok }; });
    const text = await res.text();
    expect(text).toBe("abc");
    expect(seen).toEqual({ full: "abc", ok: true });
  });

  it("reports ok=false when the stream errors mid-flight (so callers skip persisting)", async () => {
    let seen: { full: string; ok: boolean } | null = null;
    const res = textStreamResponse(bad(), async (full, ok) => { seen = { full, ok }; });
    const text = await res.text();
    expect(text).toContain("a");
    expect(text).toContain("[error:");
    expect(seen).not.toBeNull();
    expect(seen!.ok).toBe(false);
  });
});
