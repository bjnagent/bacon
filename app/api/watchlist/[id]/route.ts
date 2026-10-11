import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail } from "@/lib/api";

// PATCH: edit the member-owned fields (thesis / conviction / note). DELETE:
// stop tracking. RLS guarantees a member can only touch their own rows, so
// matching on id alone is safe.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const body = await readJson<{ thesis?: unknown; conviction?: unknown; note?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });

  const patch: Record<string, string | number> = {};
  if (typeof body.thesis === "string") patch.thesis = body.thesis.slice(0, 2000);
  if (typeof body.note === "string") patch.note = body.note.slice(0, 500);
  if (typeof body.conviction === "number" && Number.isFinite(body.conviction)) {
    patch.conviction = Math.max(0, Math.min(5, Math.round(body.conviction)));
  }
  if (Object.keys(patch).length === 0) return fail(400, "Nothing to save", { code: "bad_request" });

  const { error } = await auth.sb.from("watchlist").update(patch).eq("id", id);
  if (error) return fail(500, "Couldn't save that — try again.", { code: "db_error" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const { error } = await auth.sb.from("watchlist").delete().eq("id", id);
  if (error) return fail(500, "Couldn't remove that — try again.", { code: "db_error" });
  return NextResponse.json({ ok: true });
}
