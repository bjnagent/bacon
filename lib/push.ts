// Push notifications to the iOS app.
//
// Callers (the nightly brief, the kill-condition watch, level alerts) call
// notifyUser() and move on: it is best-effort, bounded in time and never
// throws. Whether an account's PLAN includes push is the caller's decision
// (feature "push_alerts"); this module only honours the user's own switch
// (settings.push_enabled) and delivers to their registered devices.
//
// Transport and auth live in lib/apns.ts; device tokens arrive through
// /api/push/register from the app (lib/client/push.ts).

import { createAdminClient } from "./supabase/admin";
import { apnsConfigFromEnv, sendNotifications, type ApnsConfig, type ApnsEnvironment } from "./apns";
import { swallowed } from "./log";

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path to open when tapped, e.g. "/" or "/analyze/NVDA". */
  path?: string;
  kind?: "brief" | "kill" | "level" | "system";
}

/** Most devices one account is pushed to (newest first): a cap on fan-out, not a product limit. */
const MAX_DEVICES = 10;
/** Upper bound on one notifyUser call, DB reads included. */
const BUDGET_MS = 10_000;

// ---------------------------------------------------------------------------
// Device tokens (shared with /api/push/register)

/** An APNs device token: hex, 32 bytes today, up to 100 per Apple's guidance. Normalised to lower case. */
export function normalizeDeviceToken(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/[\s<>]/g, "");
  return /^[0-9a-fA-F]{64,200}$/.test(t) ? t.toLowerCase() : null;
}

export type Registration = { token: string; environment: ApnsEnvironment };

/** Validate a POST /api/push/register body. Missing environment means production. */
export function parseRegistration(body: unknown): Registration | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { token?: unknown; environment?: unknown };
  const token = normalizeDeviceToken(b.token);
  if (!token) return { error: "token must be a hex APNs device token" };
  if (b.environment === undefined || b.environment === null) return { token, environment: "production" };
  const environment = b.environment === "production" || b.environment === "sandbox" ? b.environment : null;
  if (!environment) return { error: 'environment must be "production" or "sandbox"' };
  return { token, environment };
}

// ---------------------------------------------------------------------------
// Sending

function hasAdmin(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

async function deliver(cfg: ApnsConfig, userId: string, msg: PushMessage): Promise<number> {
  const sb = createAdminClient();
  const [settingsRes, tokensRes] = await Promise.all([
    sb.from("settings").select("push_enabled").eq("user_id", userId).maybeSingle(),
    sb.from("device_tokens").select("token, environment").eq("user_id", userId).eq("platform", "ios")
      .order("last_seen_at", { ascending: false }).limit(MAX_DEVICES),
  ]);
  // A missing settings row (or column) means the default: on.
  if ((settingsRes.data as { push_enabled?: boolean | null } | null)?.push_enabled === false) return 0;
  if (tokensRes.error) { swallowed("push.tokens", tokensRes.error); return 0; }
  const tokens = (tokensRes.data ?? []) as { token: string; environment: string | null }[];
  if (!tokens.length) return 0;

  const results = await sendNotifications(cfg, tokens, {
    title: msg.title,
    body: msg.body,
    path: msg.path,
    kind: msg.kind,
    // A newer morning brief replaces yesterday's on the lock screen.
    collapseId: msg.kind === "brief" ? "brief" : undefined,
  });

  // Housekeeping: forget dead tokens, remember which gateway a token really uses.
  const dead = results.filter((r) => r.remove).map((r) => r.token);
  const moved = results.filter((r) => r.movedTo);
  await Promise.all([
    dead.length ? sb.from("device_tokens").delete().in("token", dead).then(({ error }) => { if (error) swallowed("push.prune", error); }) : null,
    ...moved.map((r) => sb.from("device_tokens").update({ environment: r.movedTo }).eq("token", r.token)
      .then(({ error }) => { if (error) swallowed("push.env", error); })),
  ]);
  const failed = results.filter((r) => !r.ok && !r.remove);
  if (failed.length) swallowed("push.send", `${failed.length} failed: ${[...new Set(failed.map((r) => `${r.status} ${r.reason ?? ""}`.trim()))].join(", ")}`);

  return results.filter((r) => r.ok).length;
}

/** Best-effort: never throws. Resolves to the number of devices notified. */
export async function notifyUser(userId: string, msg: PushMessage): Promise<number> {
  try {
    const cfg = apnsConfigFromEnv();
    if (!cfg || !userId || !hasAdmin() || !msg?.title) return 0;
    return await withTimeout(deliver(cfg, userId, msg), BUDGET_MS, 0);
  } catch (e) {
    swallowed("push.notifyUser", e);
    return 0;
  }
}

