import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCalibrationMemo, type GradedCall } from "@/lib/calls";

// GET: the calibration profile — how bacon's own graded calls have performed.
// The same memo the prompts receive, plus raw counts for the Record tab.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { data } = await sb.from("calls")
      .select("action,source,crowded,conviction,actual_pct,bench_pct,direction_hit,target_err_pct,graded_at,created_at")
      .order("created_at", { ascending: false }).limit(300);
    const all = (data ?? []) as (GradedCall & { graded_at: string | null })[];
    const gradedRows = all.filter((c) => c.direction_hit != null);
    return NextResponse.json({
      total: all.length,
      graded: gradedRows.length,
      finalized: all.filter((c) => c.graded_at).length,
      memo: buildCalibrationMemo(all),
    });
  } catch {
    return NextResponse.json({ total: 0, graded: 0, finalized: 0, memo: "" });
  }
}
