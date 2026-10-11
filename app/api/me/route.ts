import { NextResponse } from "next/server";
import { requireUser, isResponse } from "@/lib/api";
import { getPlanState } from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";

// The signed-in account's plan, allowances and this month's usage — everything
// the client needs to label a button "3 left" or open the right paywall. No
// prices or secrets; the catalog itself is static and lives in lib/plans.ts.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const state = await getPlanState(auth.sb, auth.user);
  const plan = PLANS[state.plan];
  const trialDaysLeft = state.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(state.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;
  return NextResponse.json(
    {
      user: auth.user,
      plan: state,
      limits: plan.limits,
      features: plan.features,
      watchlistMax: plan.watchlistMax,
      themesMax: plan.themesMax,
      trialDaysLeft,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
