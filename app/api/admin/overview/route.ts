import { NextResponse } from "next/server";
import { requireAdmin, loadOverview, clampDays } from "@/lib/admin";

// Operator metrics: spend, token volume, throughput and error rate, sliced by
// day / route / model, plus the live tail of recent calls. The console renders
// its first paint from the server component; this serves the range switcher and
// the refresh button.
//
// A non-admin gets 404, not 403 — the console's existence isn't advertised to
// signed-in users who have no business with it.
export async function GET(req: Request) {
  const { ok, db } = await requireAdmin();
  if (!ok || !db) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await loadOverview(db, clampDays(new URL(req.url).searchParams.get("days")));
  if (!data) return NextResponse.json({ error: "Couldn't load metrics" }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
