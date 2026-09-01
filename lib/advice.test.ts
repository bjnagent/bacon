import { describe, it, expect, afterEach, vi } from "vitest";
import { adviceEnabled } from "./advice";

const set = (env: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};
afterEach(() => { set({ ADVICE_EMAILS: undefined, ADMIN_EMAILS: undefined }); vi.restoreAllMocks(); });

describe("adviceEnabled", () => {
  it("entitles only the listed accounts", () => {
    set({ ADVICE_EMAILS: "owner@example.com" });
    expect(adviceEnabled("owner@example.com")).toBe(true);
    expect(adviceEnabled("OWNER@EXAMPLE.COM")).toBe(true);   // case-insensitive
    expect(adviceEnabled("someone.else@example.com")).toBe(false);
  });

  // Zero-config for the owner: the admin list already identifies them. Kept as a
  // separate variable so the two permissions can diverge without a code change.
  it("falls back to the admin allowlist when unset", () => {
    set({ ADVICE_EMAILS: undefined, ADMIN_EMAILS: "owner@example.com" });
    expect(adviceEnabled("owner@example.com")).toBe(true);
    expect(adviceEnabled("other@example.com")).toBe(false);
  });

  // Fail-CLOSED. An empty or missing config must not hand directive calls to
  // everyone — the same posture as the admin gate.
  it("entitles nobody when neither list is set", () => {
    set({ ADVICE_EMAILS: undefined, ADMIN_EMAILS: undefined });
    expect(adviceEnabled("owner@example.com")).toBe(false);
    expect(adviceEnabled(null)).toBe(false);
  });

  it("treats an empty ADVICE_EMAILS as unset rather than as an empty allowlist", () => {
    set({ ADVICE_EMAILS: "   ", ADMIN_EMAILS: "owner@example.com" });
    expect(adviceEnabled("owner@example.com")).toBe(true);
  });
});
