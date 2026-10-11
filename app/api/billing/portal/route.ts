import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail } from "@/lib/api";
import { readSubscription, sanitizeReturnPath, siteOrigin, stripeCustomerOf, type ExistingRow } from "@/lib/billing";
import { createPortalSession, stripeConfigured, type StripeError } from "@/lib/stripe";

// The Stripe customer portal: update the card, switch plan, cancel, download
// invoices. Only for people with a Stripe customer — App Store subscriptions are
// managed by Apple (the client sends those to apps.apple.com instead).

export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  // The body is optional: an empty POST returns to "/".
  const body = await readJson<{ returnPath?: unknown }>(req);
  const returnPath = sanitizeReturnPath(body?.returnPath);

  if (!stripeConfigured()) return fail(503, "Billing isn't configured yet.", { code: "billing_unconfigured" });

  let row: ExistingRow | null = null;
  try {
    row = await readSubscription(sb, user.id);
  } catch (e) {
    console.warn(`[billing] portal: couldn't read subscription for ${user.id}: ${(e as Error).message}`);
  }
  const customer = stripeCustomerOf(row);
  if (!customer) {
    const appStore = row?.provider === "app_store";
    return fail(404, appStore
      ? "Your plan is billed by the App Store. Manage it on your iPhone or iPad: Settings → your name → Subscriptions."
      : "There's no web billing account for you yet — you haven't subscribed on the web.", {
      code: appStore ? "app_store_subscription" : "no_billing_account",
    });
  }

  try {
    const session = await createPortalSession({ customer, return_url: `${siteOrigin(req.url)}${returnPath}` });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(`[billing] portal session failed for ${user.id}: ${(e as StripeError).message}`);
    return fail(502, "We couldn't open billing right now. Please try again in a moment.", { code: "billing_error" });
  }
}
