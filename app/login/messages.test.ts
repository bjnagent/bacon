import { describe, expect, it } from "vitest";
import { friendlyAuthError, linkErrorMessage, parseIntent, validateAuth, validateNewPassword } from "./messages";

describe("validateAuth", () => {
  it("requires a plausible email for every intent", () => {
    expect(validateAuth("signin", "", "pw")?.field).toBe("email");
    expect(validateAuth("magic", "not-an-email", "")?.field).toBe("email");
    expect(validateAuth("reset", "a@b", "")?.field).toBe("email");
    expect(validateAuth("reset", "a@b.co", "")).toBeNull();
  });

  it("needs a password to sign in but not for a link", () => {
    expect(validateAuth("signin", "a@b.co", "")?.field).toBe("password");
    expect(validateAuth("magic", "a@b.co", "")).toBeNull();
    expect(validateAuth("signin", "a@b.co", "x")).toBeNull();
  });

  it("enforces the 8-character minimum on sign-up only", () => {
    expect(validateAuth("signup", "a@b.co", "1234567")?.message).toMatch(/at least 8/);
    expect(validateAuth("signup", "a@b.co", "12345678")).toBeNull();
    expect(validateAuth("signin", "a@b.co", "123")).toBeNull();
  });

  it("caps new passwords at bcrypt's 72 bytes", () => {
    expect(validateNewPassword("a".repeat(72))).toBeNull();
    expect(validateNewPassword("a".repeat(73))?.message).toMatch(/72/);
    // Multi-byte characters count as bytes, not characters.
    expect(validateNewPassword("é".repeat(37))?.message).toMatch(/72/);
  });
});

describe("parseIntent", () => {
  it("defaults unknown values to sign-in", () => {
    expect(parseIntent("signup")).toBe("signup");
    expect(parseIntent("magic")).toBe("magic");
    expect(parseIntent("reset")).toBe("reset");
    expect(parseIntent("drop table")).toBe("signin");
    expect(parseIntent(null)).toBe("signin");
  });
});

describe("friendlyAuthError", () => {
  it("maps known Supabase codes to the right field", () => {
    expect(friendlyAuthError("signin", { code: "invalid_credentials", message: "Invalid login credentials" }).field).toBe("password");
    expect(friendlyAuthError("signup", { code: "user_already_exists" }).field).toBe("email");
    expect(friendlyAuthError("signup", { code: "weak_password" }).field).toBe("password");
    expect(friendlyAuthError("magic", { code: "over_email_send_rate_limit" }).message).toMatch(/wait a minute/i);
  });

  it("falls back to message text when there is no code", () => {
    expect(friendlyAuthError("signin", { message: "Email not confirmed" }).message).toMatch(/confirm your email/i);
    expect(friendlyAuthError("magic", { message: "For security purposes, you can only request this after 42 seconds." }).message).toMatch(/too many/i);
  });

  it("never echoes an unknown raw error", () => {
    const r = friendlyAuthError("signup", { message: "pq: relation does not exist" });
    expect(r.message).not.toMatch(/pq:/);
    expect(r.message).toMatch(/create your account/);
  });
});

describe("linkErrorMessage", () => {
  it("explains expired links and cross-browser opens", () => {
    expect(linkErrorMessage("Email link is invalid or has expired")).toMatch(/expired/);
    expect(linkErrorMessage("invalid request: both auth code and code verifier should be non-empty")).toMatch(/same device/);
    expect(linkErrorMessage("code verifier not found")).toMatch(/same device/);
    expect(linkErrorMessage(undefined)).toMatch(/couldn't verify/);
  });
});
