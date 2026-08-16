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

// `limit(1)` rather than an exact count: the question is "is there at least
// one?", and counting every matching row to answer it means a full index scan
// of a user's ai_events on each Today load.
async function has(p: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<boolean> {
  try {
    const { data, error } = await p;
    return !error && (data?.length ?? 0) > 0;
  } catch { return false; }
}

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [swept, tracked, analyzed] = await Promise.all([
    has(sb.from("daily_briefs").select("id").limit(1)),
    has(sb.from("watchlist").select("id").limit(1)),
    has(sb.from("ai_events").select("id").eq("route", "analyze").eq("user_id", user.id).limit(1)),
  ]);

  return NextResponse.json({ swept, tracked, analyzed });
}
