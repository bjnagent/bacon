import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const KEYS = ["APPLE_TEAM_ID", "APNS_BUNDLE_ID", "CAP_APP_ID"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

type Component = { "/": string; exclude?: boolean };
type Aasa = { applinks: { details: { appIDs: string[]; components: Component[] }[] }; webcredentials: { apps: string[] } };

/** iOS semantics: the first matching component wins; `*` is any run of characters. */
function opensInApp(aasa: Aasa, path: string): boolean {
  for (const c of aasa.applinks.details[0].components) {
    const re = new RegExp("^" + c["/"].replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    if (re.test(path)) return !c.exclude;
  }
  return false;
}

describe("GET /.well-known/apple-app-site-association", () => {
  it("404s until APPLE_TEAM_ID is set", async () => {
    const res = GET();
    expect(res.status).toBe(404);
  });

  it("serves JSON for the team + bundle id, cacheable, no redirect", async () => {
    process.env.APPLE_TEAM_ID = "ABCDE12345";
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toMatch(/public/);
    const body = (await res.json()) as Aasa;
    expect(body.applinks.details[0].appIDs).toEqual(["ABCDE12345.app.bacon.research"]);
    expect(body.webcredentials.apps).toEqual(["ABCDE12345.app.bacon.research"]);
  });

  it("uses APNS_BUNDLE_ID, then CAP_APP_ID", async () => {
    process.env.APPLE_TEAM_ID = "T";
    process.env.CAP_APP_ID = "com.example.cap";
    expect(((await GET().json()) as Aasa).applinks.details[0].appIDs).toEqual(["T.com.example.cap"]);
    process.env.APNS_BUNDLE_ID = "com.example.apns";
    expect(((await GET().json()) as Aasa).applinks.details[0].appIDs).toEqual(["T.com.example.apns"]);
  });

  it("opens app screens in the app and keeps API/admin/marketing in the browser", async () => {
    process.env.APPLE_TEAM_ID = "T";
    const aasa = (await GET().json()) as Aasa;
    for (const p of ["/", "/news", "/watchlist", "/property", "/analyze", "/analyze/NVDA", "/track-record", "/account", "/account/billing", "/onboarding", "/api/auth/confirm"]) {
      expect(opensInApp(aasa, p), p).toBe(true);
    }
    for (const p of ["/api/me", "/api/auth/callback", "/api/billing/revenuecat", "/admin", "/admin/users", "/login", "/welcome", "/pricing", "/legal/terms", "/record"]) {
      expect(opensInApp(aasa, p), p).toBe(false);
    }
  });
});
