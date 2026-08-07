// Admin gate for the operator console.
//
// The gate is APPLICATION-level on purpose. The alternative — a SECURITY DEFINER
// RPC or a broad "admins can read everything" RLS policy — is exactly the shape
// that leaks: one over-granted EXECUTE and every user's data is readable by
// `anon`. Here the DB grants nothing extra; `ai_events` keeps a
// read-your-own-rows policy and nothing more. Cross-user reads happen only
// through the service-role client, which never leaves the server, and only after
// this function has verified the caller against an env allowlist.
//
// ADMIN_EMAILS is a comma-separated list. It is NOT NEXT_PUBLIC_ — the browser
// must never see it, and an empty/unset value means the console is closed to
// everyone (fail-CLOSED, the opposite of the quota gate's fail-open).

import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { Overview, UserRow } from "./adminTypes";

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
export async function loadOverview(db: Db, days: number): Promise<Overview | null> {
  const [overview, recent] = await Promise.all([
    db.rpc("admin_usage_overview", { p_days: days }),
    db.rpc("admin_recent_events", { p_limit: 60 }),
  ]);
  if (overview.error || !overview.data) return null;
  return { ...(overview.data as unknown as Overview), recent: (recent.data ?? []) as Overview["recent"] };
}

export async function loadUsers(db: Db, days: number, limit: number): Promise<UserRow[] | null> {
  const { data, error } = await db.rpc("admin_user_activity", { p_days: days, p_limit: limit });
  if (error) return null;
  return (data ?? []) as unknown as UserRow[];
}
