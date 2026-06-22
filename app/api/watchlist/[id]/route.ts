import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH: edit user-owned fields (thesis / conviction / note). DELETE: remove.
// RLS guarantees a user can only touch their own rows, so we match on id alone.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { thesis?: string; conviction?: number; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const patch: Record<string, string | number> = {};
  if (typeof body.thesis === "string") patch.thesis = body.thesis.slice(0, 2000);
  if (typeof body.note === "string") patch.note = body.note.slice(0, 500);
  if (typeof body.conviction === "number") patch.conviction = Math.max(0, Math.min(5, Math.round(body.conviction)));
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No editable fields" }, { status: 400 });

  const { error } = await sb.from("watchlist").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await sb.from("watchlist").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
