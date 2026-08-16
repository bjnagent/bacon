import { unstable_cache } from "next/cache";
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
const CACHE_SECONDS = 300;

/** Returns `configured: false` when HOUSE_USER_ID is unset — never a fallback account. */
async function fetchHouseRecord(): Promise<HouseRecord> {
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

// /record is public and identical for every visitor, and it is the surface most
// likely to take a traffic spike — it exists to be linked from a launch post.
// Left uncached it ran one service-role query per pageview. Grading runs
// nightly, so five minutes of staleness costs nothing.
//
// Cached at the DATA layer rather than with the page's `revalidate` export, so
// the page stays dynamic. A statically generated page would be prerendered at
// build time, where the service-role key is absent — baking the "couldn't load"
// state into the first response every deploy serves.
//
// `unstable_cache` is deprecated in Next 16 in favour of `use cache`, but that
// directive requires `cacheComponents: true`, an app-wide opt-in that changes
// caching semantics on every route. That migration deserves its own change.
export const loadHouseRecord = unstable_cache(
  fetchHouseRecord,
  ["house-record"],
  { revalidate: CACHE_SECONDS, tags: ["house-record"] },
);
