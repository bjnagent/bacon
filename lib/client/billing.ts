"use client";

// Starting and managing a paid plan, on whichever channel the user is on.
//
//  - In the iOS app, digital subscriptions must go through Apple (App Store
//    Review Guideline 3.1.1), so the purchase runs natively via StoreKit.
//  - On the web, Stripe Checkout and the Stripe customer portal.
//
// Both end in the same place: the provider's webhook writes `subscriptions`,
// and /api/me reflects it.

import { apiFetch } from "./api";
import type { PurchaseAccount } from "./purchases";
import { isNative, openExternal } from "@/lib/native";
import type { PlanId } from "@/lib/plans";

export type Interval = "month" | "year";

export async function startUpgrade(
  plan: Exclude<PlanId, "free">,
  interval: Interval,
  me?: PurchaseAccount | null,
): Promise<"redirected" | "purchased" | "cancelled"> {
  if (isNative()) {
    const { purchase } = await import("./purchases");
    return (await purchase(plan, interval, me)) ? "purchased" : "cancelled";
  }
  const { url } = await apiFetch<{ url: string }>("/api/billing/checkout", { body: { plan, interval, returnPath: window.location.pathname } });
  window.location.assign(url);
  return "redirected";
}

/** Manage / cancel. App Store subscriptions can only be managed by Apple. */
export async function manageSubscription(provider: string | null): Promise<void> {
  if (provider === "app_store") {
    openExternal("https://apps.apple.com/account/subscriptions");
    return;
  }
  // Inside the iOS app, never open the Stripe portal: it offers plan changes,
  // which App Review treats as steering away from in-app purchase (3.1.1).
  if (isNative()) throw new Error("Your plan is billed on the web — manage it from Bacon in your browser.");
  const { url } = await apiFetch<{ url: string }>("/api/billing/portal", { body: { returnPath: window.location.pathname } });
  window.location.assign(url);
}

export async function restorePurchases(me?: PurchaseAccount | null): Promise<boolean> {
  if (!isNative()) return false;
  const { restore } = await import("./purchases");
  return restore(me);
}
