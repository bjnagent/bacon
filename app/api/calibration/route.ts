import { requireUser, isResponse, fail } from "@/lib/api";
import { buildCalibrationMemo, CALIBRATION_MIN_N, type GradedCall } from "@/lib/calls";
import { toPublicCall, type CallRecord } from "@/lib/houseRecord";
import type { RecordCall, RecordPayload } from "@/components/record/recordModel";

// GET: the signed-in account's own record — every call it has filed, graded or
// not, plus the calibration memo the prompts receive. This is the Record tab's
// single source: the stats, the chart and the calls list are all computed on
// the client from `calls`, so they cannot disagree with each other.
//
// Every call goes back, wins, misses and the ones too new to grade. The Record
// tab may FILTER the list for reading, but the stats it shows are always built
// from this unfiltered set.

const LIMIT = 300;


type Row = CallRecord & GradedCall & { id: string; crowded: string | null; target_err_pct: number | string | null };

const num = (v: number | string | null): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb } = auth;

  const { data, error } = await sb.from("calls")
    .select("id,instrument,action,source,conviction,target_text,crowded,created_at,horizon_date,actual_pct,bench_pct,direction_hit,target_err_pct,graded_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) return fail(500, "Couldn't load your record. Please try again.", { code: "record_unavailable" });

  const rows = (data ?? []) as Row[];
  // PostgREST hands numerics back as strings; the memo does arithmetic on them.
  const graded: GradedCall[] = rows.map((r) => ({
    action: r.action, source: r.source, crowded: r.crowded, conviction: r.conviction,
    actual_pct: num(r.actual_pct), bench_pct: num(r.bench_pct), direction_hit: r.direction_hit,
    target_err_pct: num(r.target_err_pct),
  }));
  const calls: RecordCall[] = rows.map((r) => ({
    ...toPublicCall(r),
    id: r.id,
    crowded: r.crowded ?? null,
    targetErrPct: num(r.target_err_pct),
  }));

  const body: RecordPayload = {
    total: rows.length,
    graded: rows.filter((r) => r.direction_hit != null).length,
    finalized: rows.filter((r) => r.graded_at).length,
    memo: buildCalibrationMemo(graded),
    minGraded: CALIBRATION_MIN_N,
    calls,
    truncated: rows.length === LIMIT,
  };
  return Response.json(body);
}
