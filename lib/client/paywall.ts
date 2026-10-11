"use client";

// The paywall is opened from anywhere — an API 402, a locked button, the
// account screen — and rendered once by the shell. A tiny event bus keeps the
// callers free of React context.

import type { Feature, Meter, PlanId } from "@/lib/plans";

export interface PaywallRequest {
  reason?: "feature" | "limit" | "browse";
  feature?: Feature;
  meter?: Meter;
  plan?: PlanId;
  suggested?: PlanId | null;
  limit?: number;
  resetsAt?: string;
  error?: string;
}

type Listener = (req: PaywallRequest) => void;
const listeners = new Set<Listener>();

export function openPaywall(req: PaywallRequest = { reason: "browse" }): void {
  listeners.forEach((l) => l(req));
}

export function onPaywall(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
