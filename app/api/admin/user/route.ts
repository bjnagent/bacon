import { NextResponse } from "next/server";
import { requireAdmin, loadUserDetail, clampLimit } from "@/lib/admin";

// One user's drill-down: chat transcript, names and themes followed, filed
// calls. Split from /api/admin/users because a transcript per row would make
// the table payload enormous — this loads only when a row is opened.
export async function GET(req: Request) {
  const { ok, db } = await requireAdmin();
  if (!ok || !db) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  // A uuid check keeps a malformed id from reaching Postgres as a cast error.
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Bad user id" }, { status: 400 });
  }

  const detail = await loadUserDetail(db, id, clampLimit(q.get("limit")));
  if (!detail) return NextResponse.json({ error: "Couldn't load user" }, { status: 500 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
