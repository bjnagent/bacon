import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimEvent, processRevenueCatEvent, releaseEvent, REVENUECAT_EVENTS, safeEqual, type RevenueCatEvent,
} from "@/lib/billing";
import { listSubscriptions, stripeConfigured } from "@/lib/stripe";

// App Store subscriptions, via RevenueCat's webhook (Project → Integrations →
// Webhooks). The iOS app logs in to RevenueCat with the Supabase user id, so
// `app_user_id` IS the account; purchases made before sign-in (anonymous
// $RCAnonymousID users) are ignored until RevenueCat aliases them to a real id.
//
// Auth: RevenueCat sends the "Authorization header value" configured on the
// webhook verbatim. It's compared in constant time against
// REVENUECAT_WEBHOOK_AUTH (either the bare value or "Bearer <value>").
//
// Responses: 200 processed / duplicate / deliberately ignored; 401 bad auth;
// 400 malformed; 500 processing failed (ledger row released → RevenueCat
// retries); 503 not configured.
//
// Sandbox events are processed by default — App Review buys in the sandbox
// against the production build, and a purchase that doesn't unlock anything is
// a rejection. Set REVENUECAT_ACCEPT_SANDBOX=0 to ignore them (note this also
// makes TestFlight purchases unlock nothing).

export const maxDuration = 30;

const LIVE_STRIPE = new Set(["active", "trialing", "past_due"]);

export async function POST(req: Request) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Billing isn't configured yet.", code: "billing_unconfigured" }, { status: 503 });
  }
  const got = req.headers.get("authorization") ?? "";
  if (!safeEqual(got, expected) && !safeEqual(got, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { event?: RevenueCatEvent } | null = null;
  try { body = (await req.json()) as { event?: RevenueCatEvent }; } catch { /* answered below */ }
  const event = body?.event;
  if (!event || typeof event.type !== "string" || typeof event.id !== "string" || !event.id) {
    return NextResponse.json({ error: "Not a RevenueCat event" }, { status: 400 });
  }
  if (event.type === "TEST") return NextResponse.json({ ok: true, test: true });
  if (!REVENUECAT_EVENTS.has(event.type)) return NextResponse.json({ ok: true, ignored: event.type });
  if (event.store && event.store !== "APP_STORE" && event.store !== "MAC_APP_STORE") {
    return NextResponse.json({ ok: true, ignored: `store ${event.store}` });
  }
  if (event.environment === "SANDBOX" && process.env.REVENUECAT_ACCEPT_SANDBOX === "0") {
    return NextResponse.json({ ok: true, ignored: "sandbox" });
  }

  const db = createAdminClient();
  try {
    if ((await claimEvent(db, event.id, "revenuecat", event.type)) === "duplicate") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  } catch (e) {
    console.error(`[billing] revenuecat ${event.id}: couldn't record the event — ${(e as Error).message}`);
    return NextResponse.json({ error: "Event ledger unavailable" }, { status: 500 });
  }

  try {
    const res = await processRevenueCatEvent(db, event, {
      findLiveStripeSubscription: stripeConfigured()
        ? async (customer) => (await listSubscriptions(customer)).data.find((s) => LIVE_STRIPE.has(s.status)) ?? null
        : undefined,
    });
    const o = res.outcome;
    console.info(`[billing] revenuecat ${event.type} ${event.id} (${event.environment ?? "?"}): ${o ? `${o.applied ? "applied" : "skipped"} for ${o.userId} — ${o.reason}` : res.note ?? "no-op"}`);
    return NextResponse.json({ ok: true, handled: res.handled, applied: o?.applied ?? false });
  } catch (e) {
    await releaseEvent(db, event.id);
    console.error(`[billing] revenuecat ${event.type} ${event.id} failed: ${(e as Error).message}`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
