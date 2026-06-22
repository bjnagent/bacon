import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Scout themes — per-user, RLS-scoped. GET list / POST add / DELETE remove.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await sb.from("themes").select("id,label,created_at").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ themes: data });
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { label?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const label = String(body.label || "").trim();
  if (!label) return NextResponse.json({ error: "Missing label" }, { status: 400 });

  // Skip case-insensitive duplicates for this user.
  const { data: existing } = await sb.from("themes").select("id").ilike("label", label).maybeSingle();
  if (existing) return NextResponse.json({ error: "Already added", duplicate: true }, { status: 409 });

  const { data, error } = await sb.from("themes").insert({ user_id: user.id, label }).select("id,label,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ theme: data });
}

export async function DELETE(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await sb.from("themes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
