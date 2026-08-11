import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The three first-actions behind the checklist on Today.
//
// Answered from durable server state rather than a client flag, so the
// checklist is right when someone signs in from a second device — a checklist
// that has forgotten what you already did is worse than none at all.
//
// Each signal is the same record the user would point at themselves:
//   swept    — daily_briefs, the permanent history (scout_picks get replaced
//              wholesale by each sweep, so they can't answer "ever").
//   tracked  — a watchlist row.
//   analyzed — an ai_events row for the analyze route. Written service-side,
//              but RLS grants each user SELECT on their own, so the caller's
//              session can read it without widening any privilege.
//
// Every check degrades to `false` on error. A step that stays unticked is a
// harmless nudge; a 500 here would break the whole Today view for a cosmetic
// feature.
export const dynamic = "force-dynamic";

async function has(p: PromiseLike<{ count: number | null; error: unknown }>): Promise<boolean> {
  try {
    const { count, error } = await p;
    return !error && (count ?? 0) > 0;
  } catch { return false; }
}

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const head = { count: "exact" as const, head: true };
  const [swept, tracked, analyzed] = await Promise.all([
    has(sb.from("daily_briefs").select("id", head)),
    has(sb.from("watchlist").select("id", head)),
    has(sb.from("ai_events").select("id", head).eq("route", "analyze").eq("user_id", user.id)),
  ]);

  return NextResponse.json({ swept, tracked, analyzed });
}
