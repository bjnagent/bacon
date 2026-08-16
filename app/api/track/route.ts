import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Behaviour ingest. Writes through the CALLER'S session, not the service role,
// so RLS pins every row to the sender — a client cannot forge events for
// another account even if it lies in the body.
//
// Fire-and-forget by design: the client batches and may send via sendBeacon,
// which cannot read a response. Errors are swallowed into a 204 rather than
// surfaced, because a failed analytics write must never look like a failed
// user action.

const KINDS = new Set(["view", "action"]);
const MAX_BATCH = 20;
// Per-user daily ceiling. The batching client emits at most a few hundred
// events in a heavy day, so this never touches a real session — it exists
// because nothing obliges a caller to use our client. Every other write route
// carries a quota gate; this one was the exception.
const MAX_PER_DAY = 2000;
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : null);

// Cheap because it stops at the cap: `limit(MAX_PER_DAY)` short-circuits once
// enough rows are seen, where an exact count would tally every row the user has
// written today just to compare against a constant.
async function overDailyCap(sb: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from("user_events")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", midnightUtc.toISOString())
    .limit(MAX_PER_DAY);
  // Fail OPEN, as the quota gate does: a metering read that errors must not
  // start dropping data.
  if (error) return false;
  return (data?.length ?? 0) >= MAX_PER_DAY;
}

export async function POST(req: Request) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new NextResponse(null, { status: 204 });

    const body = (await req.json().catch(() => null)) as { events?: unknown } | null;
    const raw = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];

    const rows = raw
      .map((e) => {
        const ev = e as { kind?: unknown; name?: unknown; detail?: unknown };
        const kind = typeof ev.kind === "string" ? ev.kind : "";
        const name = clip(ev.name, 48);
        if (!KINDS.has(kind) || !name) return null;
        return { user_id: user.id, kind, name, detail: clip(ev.detail, 120) };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Checked only when there is something to write, so an empty or malformed
    // batch costs nothing.
    if (rows.length && !(await overDailyCap(sb, user.id))) {
      await sb.from("user_events").insert(rows);
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
