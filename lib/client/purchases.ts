"use client";

// Native in-app purchase bridge (iOS). Implemented against the RevenueCat
// Capacitor plugin compiled into the app; see docs/ios.md.

import type { PlanId } from "@/lib/plans";
import type { Interval } from "./billing";

export async function purchase(plan: Exclude<PlanId, "free">, interval: Interval): Promise<boolean> {
  void plan; void interval;
  throw new Error("In-app purchase isn't available in this build.");
}

export async function restore(): Promise<boolean> {
  return false;
}
