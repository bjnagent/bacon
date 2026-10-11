import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimEvent, processStripeEvent, releaseEvent, STRIPE_EVENTS } from "@/lib/billing";
import { retrieveSubscription, verifyStripeSignature, type StripeEvent } from "@/lib/stripe";

// Stripe webhook. Point a Stripe webhook endpoint at /api/billing/webhook with
// these events: checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted, invoice.paid,
// invoice.payment_failed.
//
// Contract with Stripe:
//   400 — signature invalid / body unreadable. Stripe will retry, and it will
//         keep failing until the secret is right, which is what we want to see.
//   200 — processed, a duplicate, or an event we deliberately don't act on.
//   500 — processing failed. The event's ledger row is released first so
//         Stripe's retry (with backoff, for up to three days) is processed.
//   503 — billing isn't configured on this deployment.
//
// The body is read RAW (req.text()) — the signature covers the exact bytes.

export const maxDuration = 30;

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Billing isn't configured yet.", code: "billing_unconfigured" }, { status: 503 });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Unreadable body" }, { status: 400 });
  }
  const sig = verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret);
  if (!sig.ok) {
    console.warn(`[billing] stripe webhook rejected: ${sig.reason}`);
    return NextResponse.json({ error: "Invalid signature", reason: sig.reason }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event?.id || !event.type || !event.data?.object) {
    return NextResponse.json({ error: "Not a Stripe event" }, { status: 400 });
  }
  if (!STRIPE_EVENTS.has(event.type)) return NextResponse.json({ ok: true, ignored: event.type });

  const db = createAdminClient();
  try {
    if ((await claimEvent(db, event.id, "stripe", event.type)) === "duplicate") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  } catch (e) {
    console.error(`[billing] stripe ${event.id}: couldn't record the event — ${(e as Error).message}`);
    return NextResponse.json({ error: "Event ledger unavailable" }, { status: 500 });
  }

  try {
    const res = await processStripeEvent(db, event, { retrieveSubscription: (id) => retrieveSubscription(id) });
    const o = res.outcome;
    console.info(`[billing] stripe ${event.type} ${event.id}: ${o ? `${o.applied ? "applied" : "skipped"} for ${o.userId} — ${o.reason}` : res.note ?? "no-op"}`);
    return NextResponse.json({ ok: true, handled: res.handled, applied: o?.applied ?? false });
  } catch (e) {
    await releaseEvent(db, event.id);
    console.error(`[billing] stripe ${event.type} ${event.id} failed: ${(e as Error).message}`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
