import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Per-user settings (auto-sweep cadence + news prefs), RLS-scoped.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await sb.from("settings").select("*").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data ?? { scout_interval_minutes: 0, last_sweep_at: null } });
}

export async function PATCH(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { scout_interval_minutes?: number; news_source?: string; news_focus?: string; brief_email_enabled?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const patch: Record<string, string | number | boolean> = {};
  if (typeof body.brief_email_enabled === "boolean") patch.brief_email_enabled = body.brief_email_enabled;
  if (typeof body.scout_interval_minutes === "number") patch.scout_interval_minutes = Math.max(0, Math.round(body.scout_interval_minutes));
  if (typeof body.news_source === "string") patch.news_source = body.news_source;
  if (typeof body.news_focus === "string") patch.news_focus = body.news_focus;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { error } = await sb.from("settings").upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
