import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import Onboarding from "./Onboarding";

export const metadata: Metadata = {
  title: "Set up your desk · Bacon",
  robots: { index: false, follow: false },
};

// First-run setup, straight after sign-up. Lives outside app/(app) on purpose:
// it is full-screen with no tab bar or sidebar — nothing to wander off to
// before the three questions are answered (or skipped).
//
// proxy.ts already bounces signed-out visitors, but a page must not rely on
// that alone: check the session here too.
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?next=/onboarding");

  const sp = await searchParams;
  return <Onboarding next={safeNext(sp.next)} />;
}
