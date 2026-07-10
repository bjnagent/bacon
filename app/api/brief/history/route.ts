import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The track record: past daily briefs, newest first. Returns [] until the
// daily_briefs table exists (schema.sql), so the UI degrades gracefully.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await sb
    .from("daily_briefs")
    .select("id,brief_date,intro,caveat,items,reviewed_at,created_at,roi,kill_alert")
    .order("brief_date", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ briefs: [], migrationNeeded: true });
  return NextResponse.json({ briefs: data ?? [] });
}
