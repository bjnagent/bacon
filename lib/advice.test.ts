import { describe, it, expect, afterEach, vi } from "vitest";
import { adviceEnabled, adviceFor, isHouseAccount } from "./advice";

const set = (env: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};
afterEach(() => { set({ ADVICE_EMAILS: undefined, ADMIN_EMAILS: undefined, HOUSE_USER_ID: undefined }); vi.restoreAllMocks(); });

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

describe("house account", () => {
  const HOUSE = "6f1c2a3b-0000-4000-8000-00000000abcd";

  it("is recognised by id, whatever the case or whitespace in the env", () => {
    set({ HOUSE_USER_ID: ` ${HOUSE.toUpperCase()} ` });
    expect(isHouseAccount(HOUSE)).toBe(true);
    expect(isHouseAccount("00000000-0000-4000-8000-000000000001")).toBe(false);
    expect(isHouseAccount(null)).toBe(false);
  });

  it("is nobody when HOUSE_USER_ID is unset", () => {
    expect(isHouseAccount(HOUSE)).toBe(false);
  });

  it("never gets advice mode, even when its email is on the allowlist", () => {
    // The house brief is broadcast to every free member: a directive call
    // there is advice to people who never asked for it.
    set({ HOUSE_USER_ID: HOUSE, ADVICE_EMAILS: "owner@example.com" });
    expect(adviceFor(HOUSE, "owner@example.com")).toBe(false);
    expect(adviceFor("00000000-0000-4000-8000-000000000001", "owner@example.com")).toBe(true);
  });
});
