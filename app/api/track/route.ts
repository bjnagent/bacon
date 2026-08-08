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
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : null);

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

    if (rows.length) await sb.from("user_events").insert(rows);
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
