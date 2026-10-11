import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, badRequest } from "@/lib/api";
import {
  isLive, readSubscription, sanitizeReturnPath, siteOrigin, stripeCustomerOf, stripePriceFor,
  type ExistingRow, type Interval, type PaidPlan,
} from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import {
  createCheckoutSession, createPortalSession, retrieveSubscription, stripeConfigured, StripeError, type FormValue,
} from "@/lib/stripe";

// Start a web subscription: a Stripe Checkout session for {plan, interval}.
// The webhook — not this route — is what grants the plan; this only hands back
// the hosted page to pay on.
//
// Guards, in order:
//  - Paying twice: a live App Store subscription → 409 (manage it in the App
//    Store). A live Stripe subscription → plan changes go through the portal's
//    confirm-the-change page, so nobody ends up with two Stripe subscriptions.
//  - A founding-member / comp plan that is still running: subscribing to the
//    SAME plan starts billing when the comp ends (a Stripe trial up to that
//    date) instead of charging for days they already have.

const unconfigured = () => fail(503, "Billing isn't configured yet.", { code: "billing_unconfigured" });
const TWO_DAYS = 2 * 24 * 3600 * 1000; // Checkout requires trial_end ≥ 48h out

export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  // Inside the iOS app, digital subscriptions must be bought through Apple
  // (Guideline 3.1.1). The client already routes purchases to StoreKit there;
  // this makes sure web checkout can never open inside the app regardless.
  // The marker is appended to the WebView's user agent in capacitor.config.ts.
  if (/\bBaconApp\b/.test(req.headers.get("user-agent") ?? "")) {
    return fail(409, "Subscribe from the plan screen in the app — purchases on iPhone go through the App Store.", { code: "use_in_app_purchase" });
  }

  const body = await readJson<{ plan?: unknown; interval?: unknown; returnPath?: unknown }>(req);
  if (!body) return badRequest();
  const plan = body.plan;
  const interval = body.interval;
  if (plan !== "pro" && plan !== "desk") return badRequest("Choose the Pro or Desk plan.");
  if (interval !== "month" && interval !== "year") return badRequest("Choose monthly or yearly billing.");
  const returnPath = sanitizeReturnPath(body.returnPath);

  const price = stripePriceFor(plan as PaidPlan, interval as Interval);
  if (!stripeConfigured() || !price) return unconfigured();

  // Own row, through the user's session (RLS: own subscription read).
  let row: ExistingRow | null = null;
  try {
    row = await readSubscription(sb, user.id);
  } catch (e) {
    // Billing schema not applied yet → treat as no subscription.
    console.warn(`[billing] checkout: couldn't read subscription for ${user.id}: ${(e as Error).message}`);
  }
  const now = new Date();
  const live = isLive(row, now);

  if (live && row?.provider === "app_store") {
    return fail(409, "You already subscribe through the App Store. Change or cancel your plan in the App Store on your iPhone or iPad (Settings → your name → Subscriptions).", {
      code: "app_store_subscription",
    });
  }

  const origin = siteOrigin(req.url);
  const returnUrl = `${origin}${returnPath}`;
  const customer = stripeCustomerOf(row);

  try {
    if (live && row?.provider === "stripe" && row.provider_subscription_id && customer) {
      if (row.product_id === price) {
        return fail(409, `You're already on ${PLANS[plan as PaidPlan].name} (${interval === "year" ? "yearly" : "monthly"}).`, { code: "already_subscribed" });
      }
      return NextResponse.json({ url: await changePlanUrl(customer, row.provider_subscription_id, price, returnUrl) });
    }

    const params: Record<string, FormValue> = {
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${returnUrl}?upgraded=1`,
      cancel_url: returnUrl,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      metadata: { user_id: user.id, plan: plan as string, interval: interval as string },
      subscription_data: { metadata: { user_id: user.id, plan: plan as string } },
    };
    if (customer) params.customer = customer;
    else if (user.email) params.customer_email = user.email;

    if (process.env.STRIPE_AUTOMATIC_TAX === "1") {
      params.automatic_tax = { enabled: true };
      // An existing customer's address must be updatable for tax to be computed.
      if (customer) params.customer_update = { address: "auto", name: "auto" };
    }

    // A running comp on the same plan: bill from when it ends.
    if (live && row?.provider === "manual" && row.plan === plan && row.current_period_end) {
      const end = Date.parse(row.current_period_end);
      if (end - now.getTime() > TWO_DAYS) {
        (params.subscription_data as Record<string, FormValue>).trial_end = Math.floor(end / 1000);
      }
    }

    const session = await createCheckoutSession(params);
    if (!session.url) throw new StripeError("Checkout session has no URL", 502);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const err = e as StripeError;
    console.error(`[billing] checkout failed for ${user.id}: ${err.message}`);
    if (err.code === "billing_unconfigured") return unconfigured();
    return fail(502, "We couldn't start checkout. Please try again in a moment.", { code: "billing_error" });
  }
}

/**
 * Someone already paying on Stripe who picks another plan: the portal's
 * "confirm this change" page for exactly that switch. Falls back to the plain
 * portal if the portal configuration doesn't allow plan changes.
 */
async function changePlanUrl(customer: string, subscriptionId: string, price: string, returnUrl: string): Promise<string> {
  try {
    const sub = await retrieveSubscription(subscriptionId);
    const item = sub.items?.data?.[0];
    if (item) {
      const s = await createPortalSession({
        customer,
        return_url: returnUrl,
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: { subscription: subscriptionId, items: [{ id: item.id, price, quantity: 1 }] },
          after_completion: { type: "redirect", redirect: { return_url: `${returnUrl}?upgraded=1` } },
        },
      });
      return s.url;
    }
  } catch (e) {
    console.warn(`[billing] plan-change flow unavailable, falling back to the portal: ${(e as Error).message}`);
  }
  const s = await createPortalSession({ customer, return_url: returnUrl });
  return s.url;
}
