"use client";

// Push notifications in the iOS app (APNs via @capacitor/push-notifications),
// reached through `window.Capacitor` like the rest of lib/native.ts. Every
// export is a no-op that resolves to "unavailable"/false on the web.
//
// Permission etiquette: the app NEVER prompts on launch. NativeBridge only
// re-registers when permission was already granted; the prompt comes from
// requestPushPermission(), called where the user asked for alerts (Account →
// Notifications, the onboarding step that explains what Bacon will send).

import { isNative, plugin } from "@/lib/native";

export type PushPermission = "granted" | "denied" | "prompt" | "unavailable";

type Handle = { remove?: () => unknown };
type PushPlugin = {
  checkPermissions?: () => Promise<{ receive?: string }>;
  requestPermissions?: () => Promise<{ receive?: string }>;
  register?: () => Promise<void>;
  addListener?: (event: string, cb: (data: unknown) => void) => Handle | Promise<Handle>;
};

const REGISTER_URL = "/api/push/register";
const TOKEN_WAIT_MS = 15_000;

function pushPlugin(): PushPlugin | null {
  return plugin("PushNotifications") as PushPlugin | null;
}

/** The APNs gateway this build's tokens belong to (published by the native shell). */
export function apsEnvironment(): "production" | "sandbox" {
  if (typeof window === "undefined") return "production";
  const env = (window as unknown as { BaconNative?: { apsEnvironment?: string } }).BaconNative?.apsEnvironment;
  return env === "sandbox" ? "sandbox" : "production";
}

function asPermission(v: unknown): PushPermission {
  return v === "granted" || v === "denied" || v === "prompt" ? v : v === "prompt-with-rationale" ? "prompt" : "unavailable";
}

/** Current notification permission, without prompting. */
export async function pushPermission(): Promise<PushPermission> {
  const p = pushPlugin();
  if (!isNative() || !p?.checkPermissions) return "unavailable";
  try { return asPermission((await p.checkPermissions())?.receive); } catch { return "unavailable"; }
}

// ---------------------------------------------------------------------------
// Token → server

let lastToken: string | null = null;
let postedToken: string | null = null;
let listening = false;
const waiters: ((token: string | null) => void)[] = [];

async function postToken(token: string): Promise<boolean> {
  if (postedToken === token) return true;
  try {
    const res = await fetch(REGISTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, environment: apsEnvironment() }),
    });
    if (res.ok) postedToken = token;
    return res.ok;
  } catch {
    return false;
  }
}

function settle(token: string | null) {
  while (waiters.length) waiters.shift()!(token);
}

/** Attach the registration listeners once per page load. */
async function listen(p: PushPlugin): Promise<void> {
  if (listening || !p.addListener) return;
  listening = true;
  try {
    await p.addListener("registration", (data) => {
      const token = (data as { value?: string } | null)?.value;
      if (!token) return;
      lastToken = token;
      void postToken(token).then(() => settle(token));
    });
    await p.addListener("registrationError", () => settle(null));
  } catch {
    listening = false;
  }
}

/** Ask APNs for this install's token and hand it to the server. Resolves true once posted. */
async function registerAndSync(p: PushPlugin): Promise<boolean> {
  await listen(p);
  const got = new Promise<string | null>((resolve) => {
    const t = setTimeout(() => resolve(null), TOKEN_WAIT_MS);
    waiters.push((tok) => { clearTimeout(t); resolve(tok); });
  });
  try { await p.register?.(); } catch { settle(null); }
  const token = await got;
  return !!token && postedToken === token;
}

/**
 * Re-register on launch when the user has ALREADY allowed notifications (APNs
 * tokens can rotate; the server also learns the device is still alive). Never
 * prompts. Resolves true when a token was posted.
 */
export async function registerIfGranted(): Promise<boolean> {
  const p = pushPlugin();
  if (!p || (await pushPermission()) !== "granted") return false;
  return registerAndSync(p);
}

/**
 * Prompt for notification permission (iOS shows its system alert once; after a
 * "Don't Allow" it resolves "denied" without asking — send people to Settings).
 * On "granted" it registers with APNs and posts the token before resolving.
 */
export async function requestPushPermission(): Promise<PushPermission> {
  const p = pushPlugin();
  if (!isNative() || !p) return "unavailable";
  let status = await pushPermission();
  if (status === "prompt" && p.requestPermissions) {
    try { status = asPermission((await p.requestPermissions())?.receive); } catch { status = "denied"; }
  }
  if (status === "granted") await registerAndSync(p);
  return status;
}

/**
 * Stop this device receiving this account's notifications (sign-out, or the
 * user switching push off). Best-effort; the next sign-in re-registers.
 */
export async function unregisterPush(): Promise<void> {
  const token = lastToken ?? postedToken;
  if (!isNative() || !token) return;
  try {
    await fetch(REGISTER_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
    });
  } catch { /* best-effort */ }
  postedToken = null;
}

/**
 * Listen for taps on a notification (also delivered when the tap cold-started
 * the app). The handler gets the in-app path the server put in the payload.
 * Returns an unsubscribe function.
 */
export function onNotificationOpened(handler: (path: string, kind?: string) => void): () => void {
  const p = pushPlugin();
  if (!p?.addListener) return () => {};
  let handle: Handle | null = null;
  let removed = false;
  void Promise.resolve(p.addListener("pushNotificationActionPerformed", (data) => {
    const n = (data as { notification?: { data?: { path?: unknown; kind?: unknown } } } | null)?.notification;
    const path = typeof n?.data?.path === "string" ? n.data.path : "/";
    handler(path.startsWith("/") && !path.startsWith("//") ? path : "/", typeof n?.data?.kind === "string" ? n.data.kind : undefined);
  })).then((h) => {
    handle = h;
    if (removed) void h?.remove?.();
  }).catch(() => {});
  return () => {
    removed = true;
    void handle?.remove?.();
  };
}

/** Test hook. */
export function resetPushState(): void {
  lastToken = null;
  postedToken = null;
  listening = false;
  waiters.length = 0;
}
