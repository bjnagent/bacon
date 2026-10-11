import { describe, it, expect, vi, afterEach } from "vitest";
import { esc, renderBriefEmail } from "./email";
import type { OpportunityItem } from "./parsers";

const item = (o: Partial<OpportunityItem> = {}): OpportunityItem => ({
  name: "Cameco", ticker: "CCJ", cls: "Equity / Stock", horizon: "3–6 months", thesis: "Contract cycle turning.", signals: "Term price up.",
  action: "Buy", target: "est. +10%", confirm: "volumes rise", kill: "restart pulled forward", entry: "", stop: "", size: "", ...o,
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("esc", () => {
  it("escapes markup and quotes", () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    expect(esc(null)).toBe("");
  });
});

describe("renderBriefEmail", () => {
  it("can't be made to carry markup by model-written text", () => {
    const html = renderBriefEmail({
      intro: `<img src=x onerror=alert(1)>`,
      items: [item({ name: `<a href="https://phish.test">Sign in</a>`, thesis: "<script>x()</script>", kill: `"><b>` })],
      caveat: null,
    }, "Sun, 11 Oct 2026");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(`<a href="https://phish.test">`);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;x()&lt;/script&gt;");
  });

  it("links back to the app only when the site URL is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(renderBriefEmail({ intro: null, items: [item()], caveat: null }, "d")).not.toContain("Open in Bacon");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bacon.test/");
    const html = renderBriefEmail({ intro: null, items: [item()], caveat: null }, "d");
    expect(html).toContain(`href="https://bacon.test/"`);
    expect(html).toContain(`href="https://bacon.test/account"`);
  });
});

describe("sending", () => {
  it("is bounded in time and never throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.resetModules();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendBriefEmail, sendKillAlertEmail } = await import("./email");
    expect(await sendBriefEmail("a@x.test", { intro: null, items: [item()], caveat: null }, "d")).toBe(false);
    expect(await sendKillAlertEmail("a@x.test", [{ ticker: "CCJ", why: "x" }], "d")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
