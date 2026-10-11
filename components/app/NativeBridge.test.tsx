// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { AppCtx, type AppApi } from "./AppContext";
import NativeBridge from "./NativeBridge";
import PwaRegister, { OPEN_URL_EVENT, pathFromOpenUrl } from "@/components/PwaRegister";

vi.mock("@/lib/clientCache", () => ({ cachedJson: vi.fn(async () => ({ settings: { push_enabled: true } })), invalidate: vi.fn() }));

type Cb = (d: unknown) => void;
let listeners: Record<string, Cb[]>;
let P: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
let darkQuery: { matches: boolean; listeners: (() => void)[] };

function plugin(name: string, methods: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    ...methods,
    addListener: vi.fn((event: string, cb: Cb) => {
      (listeners[`${name}.${event}`] ??= []).push(cb);
      return { remove: vi.fn() };
    }),
  };
}
const emit = (key: string, data?: unknown) => (listeners[key] ?? []).forEach((cb) => cb(data));

beforeEach(() => {
  listeners = {};
  P = {
    SplashScreen: plugin("SplashScreen", { hide: vi.fn(async () => {}) }),
    StatusBar: plugin("StatusBar", { setStyle: vi.fn(async () => {}) }),
    Keyboard: plugin("Keyboard"),
    App: plugin("App"),
    Browser: plugin("Browser", { open: vi.fn(async () => {}) }),
    PushNotifications: plugin("PushNotifications", { checkPermissions: vi.fn(async () => ({ receive: "prompt" })), register: vi.fn() }),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: P };
  darkQuery = { matches: false, listeners: [] };
  // A live MediaQueryList: `matches` reads the current value.
  window.matchMedia = ((q: string) => ({
    get matches() { return q.includes("dark") ? darkQuery.matches : false; }, media: q,
    addEventListener: (_: string, cb: () => void) => darkQuery.listeners.push(cb), removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  delete document.documentElement.dataset.theme;
  document.documentElement.className = "";
});

function renderBridge(navigate = vi.fn()) {
  const app = { navigate, me: { user: { id: "user-1", email: null } } } as unknown as AppApi;
  render(<AppCtx.Provider value={app}><NativeBridge /><PwaRegister /></AppCtx.Provider>);
  return navigate;
}

describe("pathFromOpenUrl", () => {
  it("keeps path, query and hash of web links only", () => {
    expect(pathFromOpenUrl("https://bacon-flax.vercel.app/analyze/NVDA?x=1#top")).toBe("/analyze/NVDA?x=1#top");
    expect(pathFromOpenUrl("https://bacon-flax.vercel.app")).toBe("/");
    expect(pathFromOpenUrl("bacon://whatever")).toBeNull();
    expect(pathFromOpenUrl("not a url")).toBeNull();
  });
});

describe("native shell glue", () => {
  it("lifts the launch screen and matches the status bar to the theme", async () => {
    renderBridge();
    expect(P.SplashScreen.hide).toHaveBeenCalled();
    expect(P.StatusBar.setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" });
    // Pinning dark on <html> flips it (MutationObserver).
    await act(async () => { document.documentElement.dataset.theme = "dark"; await new Promise((r) => setTimeout(r, 0)); });
    expect(P.StatusBar.setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
    // Back to system: follows prefers-color-scheme.
    darkQuery.matches = true;
    await act(async () => { delete document.documentElement.dataset.theme; await new Promise((r) => setTimeout(r, 0)); });
    expect(P.StatusBar.setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
  });

  it("flags the open keyboard on <html>", async () => {
    renderBridge();
    await act(async () => { await Promise.resolve(); });
    act(() => emit("Keyboard.keyboardWillShow", { keyboardHeight: 300 }));
    expect(document.documentElement.classList.contains("kb-open")).toBe(true);
    act(() => emit("Keyboard.keyboardWillHide"));
    expect(document.documentElement.classList.contains("kb-open")).toBe(false);
  });

  it("routes a universal link to an app screen in place", async () => {
    const navigate = renderBridge();
    await act(async () => { await Promise.resolve(); });
    const seen: boolean[] = [];
    const spy = (e: Event) => seen.push(e.defaultPrevented);
    window.addEventListener(OPEN_URL_EVENT, spy);
    act(() => emit("App.appUrlOpen", { url: "https://bacon-flax.vercel.app/analyze/NVDA?from=mail" }));
    window.removeEventListener(OPEN_URL_EVENT, spy);
    expect(navigate).toHaveBeenCalledWith("/analyze/NVDA?from=mail");
    expect(seen).toEqual([true]);
  });

  it("leaves non-app links (sign-in links, marketing pages) to a full page load", async () => {
    const navigate = renderBridge();
    await act(async () => { await Promise.resolve(); });
    const cancelled: boolean[] = [];
    // Observe the event, and stop the default page load jsdom can't perform.
    const spy = (e: Event) => { cancelled.push(e.defaultPrevented); e.preventDefault(); };
    window.addEventListener(OPEN_URL_EVENT, spy);
    act(() => emit("App.appUrlOpen", { url: "https://bacon-flax.vercel.app/api/auth/confirm?token_hash=abc&type=email" }));
    window.removeEventListener(OPEN_URL_EVENT, spy);
    expect(navigate).not.toHaveBeenCalled();
    expect(cancelled).toEqual([false]);
  });

  it("opens off-site and _blank links in the in-app browser, leaves in-app links alone", async () => {
    renderBridge();
    const link = (href: string, target?: string) => {
      const a = document.createElement("a");
      a.href = href;
      if (target) a.target = target;
      a.textContent = "x";
      document.body.appendChild(a);
      return a;
    };
    const ext = link("https://www.sec.gov/filing");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    ext.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(P.Browser.open).toHaveBeenCalledWith(expect.objectContaining({ url: "https://www.sec.gov/filing" }));

    const blank = link("/legal/terms", "_blank");
    blank.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(P.Browser.open).toHaveBeenLastCalledWith(expect.objectContaining({ url: `${window.location.origin}/legal/terms` }));

    const internal = link("/watchlist");
    internal.addEventListener("click", (e) => e.preventDefault()); // stand-in for the router
    const ev2 = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    internal.dispatchEvent(ev2);
    expect(P.Browser.open).toHaveBeenCalledTimes(2);
  });

  it("never prompts for notifications on launch", async () => {
    renderBridge();
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(P.PushNotifications.checkPermissions).toHaveBeenCalled();
    expect(P.PushNotifications.register).not.toHaveBeenCalled();
  });

  it("does nothing in a browser", () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => false, Plugins: P };
    renderBridge();
    expect(P.SplashScreen.hide).not.toHaveBeenCalled();
    expect(P.StatusBar.setStyle).not.toHaveBeenCalled();
  });
});
