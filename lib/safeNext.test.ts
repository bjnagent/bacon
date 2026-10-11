import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("keeps same-origin paths, with query and hash", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/analyze/NVDA")).toBe("/analyze/NVDA");
    expect(safeNext("/analyze/NVDA?run=1#lens")).toBe("/analyze/NVDA?run=1#lens");
    expect(safeNext("/onboarding")).toBe("/onboarding");
    expect(safeNext("/login/reset")).toBe("/login/reset");
  });

  it("normalises harmless dot segments", () => {
    expect(safeNext("/a/../watchlist")).toBe("/watchlist");
  });

  it("rejects absolute URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("http://evil.com/path")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext("data:text/html,hi")).toBe("/");
    expect(safeNext("mailto:a@b.c")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("//evil.com/login")).toBe("/");
    expect(safeNext("///evil.com")).toBe("/");
  });

  it("rejects backslashes anywhere", () => {
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("\\\\evil.com")).toBe("/");
    expect(safeNext("/path\\to")).toBe("/");
  });

  it("rejects control characters browsers would strip", () => {
    expect(safeNext("/\t/evil.com")).toBe("/");
    expect(safeNext("/\n/evil.com")).toBe("/");
    expect(safeNext("/\r/evil.com")).toBe("/");
    expect(safeNext("/ok\u0000")).toBe("/");
  });

  it("rejects dot segments that collapse into a protocol-relative URL", () => {
    expect(safeNext("/..//evil.com")).toBe("/");
    expect(safeNext("/.//evil.com")).toBe("/");
  });

  it("keeps percent-encoded slashes as an inert same-origin path", () => {
    // Stays a path on our origin: the browser never decodes it into a host.
    expect(safeNext("/%2F%2Fevil.com")).toBe("/%2F%2Fevil.com");
  });

  it("rejects non-path and non-string values", () => {
    expect(safeNext("evil.com")).toBe("/");
    expect(safeNext("analyze")).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext(" /analyze")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(42)).toBe("/");
    expect(safeNext(["/analyze"])).toBe("/");
    expect(safeNext("/" + "a".repeat(3000))).toBe("/");
  });

  it("refuses API routes and the login page itself", () => {
    expect(safeNext("/api/auth/signout")).toBe("/");
    expect(safeNext("/api")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/login?next=/x")).toBe("/");
  });

  it("uses the caller's fallback", () => {
    expect(safeNext("https://evil.com", "/onboarding")).toBe("/onboarding");
    expect(safeNext(undefined, "/onboarding")).toBe("/onboarding");
  });
});
