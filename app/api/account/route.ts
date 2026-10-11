import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser, isResponse, readJson, fail } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLive, readSubscription, stripeCustomerOf, type ExistingRow } from "@/lib/billing";
import { cancelSubscription, listSubscriptions, stripeConfigured } from "@/lib/stripe";

// Delete the signed-in account (App Store Guideline 5.1.1(v)).
//
//  1. Stop web billing: every not-yet-ended Stripe subscription on the
//     account's customer is canceled immediately. Best effort — a Stripe outage
//     must not trap someone in an account they want gone — but every failure is
//     logged with the ids an operator needs to finish it by hand.
//  2. Delete the auth user. Every user table references auth.users with
//     ON DELETE CASCADE (the AI cost ledger keeps its rows with user_id nulled).
//  3. Sign out and expire the sb-* cookies.
//
// App Store subscriptions can't be canceled by us — Apple bills them. The
// response says whether one was live so the client can tell the person to
// cancel it in Settings.
//
// Guard: the body must be { "confirm": "DELETE" }.

const OPEN_STRIPE = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ confirm?: unknown }>(req);
  if (body?.confirm !== "DELETE") {
    return fail(400, 'Confirm by sending { "confirm": "DELETE" }.', { code: "confirmation_required" });
  }
  if (process.env.HOUSE_USER_ID && process.env.HOUSE_USER_ID.toLowerCase() === user.id.toLowerCase()) {
    // Its calls ARE the public /record; deleting it from a settings sheet would take the record down.
    return fail(403, "The house account can't be deleted from the app.", { code: "house_account" });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail(503, "Account deletion isn't available right now. Please contact support.", { code: "unconfigured" });
  }
  const admin = createAdminClient();

  let row: ExistingRow | null = null;
  try {
    row = await readSubscription(admin, user.id);
  } catch (e) {
    console.warn(`[account] delete ${user.id}: couldn't read subscription — ${(e as Error).message}`);
  }
  const appStore = row?.provider === "app_store" && isLive(row);
  const stripe = await cancelStripe(user.id, row);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(`[account] delete ${user.id} failed: ${error.message}`);
    return fail(500, "We couldn't delete your account. Please try again, or contact support.", { code: "delete_failed" });
  }
  console.info(`[account] deleted ${user.id} (stripe canceled ${stripe.canceled}, failed ${stripe.failed}; app store live: ${appStore})`);

  // The session belongs to a user that no longer exists: revoke it and clear
  // the cookies. signOut ignores the 401/404 a deleted user's token gets; the
  // explicit expiry covers the case where it bails early (an expired token
  // whose refresh now fails).
  try { await sb.auth.signOut(); } catch { /* cookies are expired below regardless */ }
  try {
    const store = await cookies();
    for (const c of store.getAll()) if (c.name.startsWith("sb-")) store.delete(c.name);
  } catch { /* nothing more to do */ }

  return NextResponse.json({ ok: true, appStore });
}

async function cancelStripe(userId: string, row: ExistingRow | null): Promise<{ canceled: number; failed: number }> {
  const customer = stripeCustomerOf(row);
  const ids = new Set<string>();
  if (row?.provider === "stripe" && row.provider_subscription_id && isLive(row)) ids.add(row.provider_subscription_id);
  if (!customer && !ids.size) return { canceled: 0, failed: 0 };
  if (!stripeConfigured()) {
    console.error(`[account] MANUAL ACTION: STRIPE_SECRET_KEY unset — cancel Stripe customer ${customer ?? "?"} subscriptions ${[...ids].join(",") || "(list them)"} for deleted user ${userId}`);
    return { canceled: 0, failed: ids.size || 1 };
  }

  let failed = 0;
  if (customer) {
    try {
      const list = await listSubscriptions(customer);
      for (const s of list.data) if (OPEN_STRIPE.has(s.status)) ids.add(s.id);
    } catch (e) {
      failed++;
      console.error(`[account] MANUAL ACTION: couldn't list Stripe subscriptions for customer ${customer} (deleted user ${userId}): ${(e as Error).message}`);
    }
  }
  let canceled = 0;
  for (const id of ids) {
    try {
      await cancelSubscription(id);
      canceled++;
    } catch (e) {
      failed++;
      console.error(`[account] MANUAL ACTION: couldn't cancel Stripe subscription ${id} (customer ${customer ?? "?"}, deleted user ${userId}): ${(e as Error).message}`);
    }
  }
  return { canceled, failed };
}
