import { NextResponse } from "next/server";
import { requireUser, isResponse } from "@/lib/api";

// The brief history: past daily briefs, newest first, with their stored ROI
// snapshot and any kill-condition alert. Answers `migrationNeeded` (not an
// error) until the daily_briefs table exists (schema.sql), so the Record tab
// can say what to do instead of failing.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const { data, error } = await auth.sb
    .from("daily_briefs")
    .select("id,brief_date,intro,caveat,items,reviewed_at,created_at,roi,kill_alert")
    .order("brief_date", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ briefs: [], migrationNeeded: true });
  return NextResponse.json({ briefs: data ?? [] });
}
