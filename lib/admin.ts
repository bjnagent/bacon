// Admin gate for the operator console.
//
// The gate is APPLICATION-level on purpose. The alternative — a broad "admins
// can read everything" RLS policy — is the shape that leaks: it makes every
// user's data readable by whoever can spoof an admin claim. Here `ai_events`
// keeps a read-your-own-rows policy and nothing more. Cross-user reads happen
// only through the service-role client, which never leaves the server, and only
// after this function has verified the caller against an env allowlist.
//
// Three of the four admin RPCs ARE security definer, which is the other shape
// worth being careful about: one over-granted EXECUTE and anon reads everything.
// They earn it — they read auth.users, which grants SELECT to `postgres` alone,
// and as invoker they simply failed for their only caller. The containment is in
// schema.sql: EXECUTE revoked from public, anon and authenticated by name, and a
// pinned search_path on each. Definer confines that elevation to three fixed
// function bodies; the alternative, granting service_role SELECT on auth.users,
// would have opened password hashes to every service-role query in the app.
//
// ADMIN_EMAILS is a comma-separated list. It is NOT NEXT_PUBLIC_ — the browser
// must never see it, and an empty/unset value means the console is closed to
// everyone (fail-CLOSED, the opposite of the quota gate's fail-open).

import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { Overview, UserRow, UserDetail } from "./adminTypes";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const list = adminEmails();
  if (!list.length) return false;          // unset → nobody is an admin
  return !!email && list.includes(email.toLowerCase());
}

export interface AdminSession {
  ok: boolean;
  email: string | null;
  /** Service-role client — only present when `ok`. */
  db: ReturnType<typeof createAdminClient> | null;
}

/**
 * A denial is deliberately indistinguishable from a missing route in the
 * browser, which also leaves the OPERATOR with no signal when it's their own
 * allowlist entry that's wrong — the failure looks identical to a broken
 * deploy. So say why, server-side only: never rendered, never sent to the
 * client, but visible in the platform logs where the person debugging is.
 *
 * The allowlist itself is never logged, only how many entries it has — enough
 * to tell "unset" from "set but doesn't match you", which is the distinction
 * that actually costs time.
 */
function denied(reason: string): void {
  console.warn(`[admin] denied — ${reason}`);
}

/**
 * Verify the current request comes from an allowlisted admin and hand back a
 * service-role client. Returns `ok:false` rather than throwing so callers choose
 * their own response (404 for the page, 403 for the API).
 */
export async function requireAdmin(): Promise<AdminSession> {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    const email = user?.email ?? null;
    if (!user) {
      denied("no signed-in session");
      return { ok: false, email, db: null };
    }
    if (!isAdminEmail(email)) {
      const n = adminEmails().length;
      denied(
        `${email} is not on the allowlist; ADMIN_EMAILS ${n === 0 ? "is unset or empty" : `has ${n} entr${n === 1 ? "y" : "ies"}`}`
      );
      return { ok: false, email, db: null };
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      denied("SUPABASE_SERVICE_ROLE_KEY is not set on this deployment");
      return { ok: false, email, db: null };
    }
    return { ok: true, email, db: createAdminClient() };
  } catch (err) {
    denied(`the check itself threw: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, email: null, db: null };
  }
}

type Db = NonNullable<AdminSession["db"]>;

export const clampDays = (v: unknown) => Math.min(365, Math.max(1, Number(v) || 30));
export const clampLimit = (v: unknown) => Math.min(500, Math.max(1, Number(v) || 100));

/**
 * The overview plus the live tail, in one shot. Aggregation happens in Postgres
 * — pulling every event row up into the app to sum in JS would be the obvious
 * way and the wrong one.
 *
 * Returns `null` on error (most likely: the migration hasn't been applied to
 * this project yet) so the page can render an empty console instead of a crash,
 * while the API route can still turn it into a 500.
 */
/**
 * A failing rollup used to be indistinguishable from an idle product: the live
 * tail fell back to `[]` on error, the user list to "No accounts yet.", and
 * nothing was written down anywhere. That is how three of these RPCs sat broken
 * on a permission error while the console looked merely quiet. Say it out loud,
 * server-side, the same way the admin gate says why it denied.
 */
function rpcFailed(what: string, err: { message?: string; code?: string } | null): void {
  console.warn(`[admin] ${what} failed — ${err?.code ? `${err.code}: ` : ""}${err?.message ?? "unknown error"}`);
}

export async function loadOverview(db: Db, days: number): Promise<Overview | null> {
  const [overview, recent] = await Promise.all([
    db.rpc("admin_usage_overview", { p_days: days }),
    db.rpc("admin_recent_events", { p_limit: 60 }),
  ]);
  if (overview.error) rpcFailed("admin_usage_overview", overview.error);
  // Not fatal — the rest of the console is still worth rendering without a tail
  // — but no longer silent, which is what let this hide.
  if (recent.error) rpcFailed("admin_recent_events", recent.error);
  if (overview.error || !overview.data) return null;
  const o = overview.data as unknown as Overview;
  return {
    ...o,
    recent: (recent.data ?? []) as Overview["recent"],
    // A project running the previous schema returns an object without these
    // keys. The console is built to degrade rather than crash when a migration
    // is outstanding, and `.map()` on undefined would break that promise.
    byFeature: o.byFeature ?? [],
    topSubjects: o.topSubjects ?? [],
    searches: o.searches ?? [],
  };
}

export async function loadUsers(db: Db, days: number, limit: number): Promise<UserRow[] | null> {
  const { data, error } = await db.rpc("admin_user_activity", { p_days: days, p_limit: limit });
  if (error) { rpcFailed("admin_user_activity", error); return null; }
  return (data ?? []) as unknown as UserRow[];
}

/** One user's transcript, followed names, themes and filed calls. */
export async function loadUserDetail(db: Db, userId: string, limit: number): Promise<UserDetail | null> {
  const { data, error } = await db.rpc("admin_user_detail", { p_user: userId, p_limit: limit });
  if (error) rpcFailed("admin_user_detail", error);
  if (error || !data) return null;
  const d = data as unknown as UserDetail;
  // Same reason as loadOverview: absent on a pre-migration schema.
  return { ...d, events: d.events ?? [], featureTotals: d.featureTotals ?? [], searches: d.searches ?? [] };
}
