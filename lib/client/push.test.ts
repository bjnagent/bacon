// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onNotificationOpened, pushPermission, registerIfGranted, requestPushPermission, resetPushState, unregisterPush } from "./push";

const TOKEN = "A1B2".repeat(16);
let listeners: Record<string, ((d: unknown) => void)[]>;
let permission: string;
let Push: Record<string, ReturnType<typeof vi.fn>>;

function install(native = true) {
  listeners = {};
  Push = {
    checkPermissions: vi.fn(async () => ({ receive: permission })),
    requestPermissions: vi.fn(async () => { permission = "granted"; return { receive: "granted" }; }),
    // APNs answers asynchronously, through the `registration` event.
    register: vi.fn(async () => { setTimeout(() => listeners.registration?.forEach((cb) => cb({ value: TOKEN })), 0); }),
    addListener: vi.fn((event: string, cb: (d: unknown) => void) => {
      (listeners[event] ??= []).push(cb);
      return { remove: vi.fn() }; // the injected (non-core) bridge returns synchronously
    }),
  };
  const w = window as unknown as Record<string, unknown>;
  w.Capacitor = { isNativePlatform: () => native, getPlatform: () => (native ? "ios" : "web"), Plugins: { PushNotifications: Push } };
  w.BaconNative = { apsEnvironment: "sandbox" };
}

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

beforeEach(() => {
  resetPushState();
  permission = "prompt";
  install();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  const w = window as unknown as Record<string, unknown>;
  delete w.Capacitor;
  delete w.BaconNative;
});

describe("push permission", () => {
  it("is unavailable on the web", async () => {
    install(false);
    expect(await pushPermission()).toBe("unavailable");
    expect(await requestPushPermission()).toBe("unavailable");
  });

  it("never prompts on launch: registerIfGranted is a no-op until the user has allowed", async () => {
    expect(await registerIfGranted()).toBe(false);
    expect(Push.requestPermissions).not.toHaveBeenCalled();
    expect(Push.register).not.toHaveBeenCalled();
  });

  it("requestPushPermission prompts, registers and posts the token with its APNs environment", async () => {
    expect(await requestPushPermission()).toBe("granted");
    expect(Push.requestPermissions).toHaveBeenCalledTimes(1);
    expect(Push.register).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/push/register", expect.objectContaining({ method: "POST" }));
    const init = fetchMock.mock.calls[0][1] as unknown as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN, environment: "sandbox" });
  });

  it("re-registers silently once granted, posting each token once per launch", async () => {
    permission = "granted";
    expect(await registerIfGranted()).toBe(true);
    expect(await registerIfGranted()).toBe(true);
    expect(Push.requestPermissions).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports denied without registering", async () => {
    Push.requestPermissions.mockResolvedValue({ receive: "denied" });
    expect(await requestPushPermission()).toBe("denied");
    expect(Push.register).not.toHaveBeenCalled();
  });

  it("unregisterPush deletes the device's token", async () => {
    permission = "granted";
    await registerIfGranted();
    await unregisterPush();
    const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(url).toBe("/api/push/register");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN });
  });
});

describe("onNotificationOpened", () => {
  it("hands the payload's in-app path to the handler, refusing anything off-site", async () => {
    const seen: string[] = [];
    const off = onNotificationOpened((p) => seen.push(p));
    await Promise.resolve();
    const tap = (data: unknown) => listeners.pushNotificationActionPerformed.forEach((cb) => cb({ actionId: "tap", notification: { data } }));
    tap({ path: "/analyze/NVDA", kind: "kill" });
    tap({ path: "https://evil.example" });
    tap({});
    expect(seen).toEqual(["/analyze/NVDA", "/", "/"]);
    off();
  });
});
