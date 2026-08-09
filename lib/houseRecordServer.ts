import { createAdminClient } from "@/lib/supabase/admin";
import { summarise, toPublicCall, type CallRecord, type HouseSummary, type PublicCall } from "@/lib/houseRecord";

// Server-only loader, split from `lib/houseRecord.ts` for the same reason
// `lib/adminTypes.ts` is split from `lib/admin.ts`: the pure module holds the
// arithmetic and the shapes, so it stays importable from tests (and any future
// client code) without dragging the service-role client along.

export interface HouseRecord {
  configured: boolean;
  summary: HouseSummary | null;
  calls: PublicCall[];
  truncated: boolean;
}

const MAX_CALLS = 500;

/** Returns `configured: false` when HOUSE_USER_ID is unset — never a fallback account. */
export async function loadHouseRecord(): Promise<HouseRecord> {
  const houseId = process.env.HOUSE_USER_ID;
  if (!houseId) return { configured: false, summary: null, calls: [], truncated: false };

  try {
    const { data, error } = await createAdminClient()
      .from("calls")
      .select("instrument,action,source,conviction,target_text,created_at,horizon_date,actual_pct,bench_pct,direction_hit,graded_at")
      .eq("user_id", houseId)
      .order("created_at", { ascending: false })
      .limit(MAX_CALLS);
    if (error) throw new Error(error.message);

    const all = ((data ?? []) as CallRecord[]).map(toPublicCall);
    return {
      configured: true,
      // The summary counts every call on record, including ones too new to
      // price — otherwise "filed" would silently mean "filed and priced".
      summary: summarise(all),
      calls: all.filter((c) => c.actualPct != null),
      truncated: all.length === MAX_CALLS,
    };
  } catch {
    return { configured: true, summary: null, calls: [], truncated: false };
  }
}
