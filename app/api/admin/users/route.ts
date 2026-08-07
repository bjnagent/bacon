import { NextResponse } from "next/server";
import { requireAdmin, loadUsers, clampDays, clampLimit } from "@/lib/admin";

// Per-user behaviour: what each account actually uses, how much it costs, and
// how engaged it is (watchlist / themes / briefs / filed calls).
export async function GET(req: Request) {
  const { ok, db } = await requireAdmin();
  if (!ok || !db) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  const users = await loadUsers(db, clampDays(q.get("days")), clampLimit(q.get("limit")));
  if (!users) return NextResponse.json({ error: "Couldn't load users" }, { status: 500 });
  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
