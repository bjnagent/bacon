import { NextResponse } from "next/server";
import { loadHouseRecord } from "@/lib/houseRecordServer";

// PUBLIC — no session required. The house account's graded calls are the proof
// behind the product's central claim, and proof behind a login isn't proof.
//
// This is the only route that reads one account's rows with the service role and
// returns them to anyone, so the boundary is drawn tightly:
//
//   * It serves exactly one account, named by HOUSE_USER_ID. Unset → 503, never
//     a fallback to "some user", so a misconfiguration cannot leak a customer.
//   * It selects named columns only. No user_id leaves this route, and `calls`
//     holds no thesis text — the reasoning stays in the product.
//   * It returns EVERY priced call. There is no outcome filter to tamper with.
//
// Live calls are excluded by consequence rather than by choice: a call is only
// priced 30 days after it is filed, so the public record can never front-run the
// paying product.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const record = await loadHouseRecord();
  if (!record.configured) {
    return NextResponse.json({ configured: false, error: "No house account configured." }, { status: 503 });
  }
  if (!record.summary) {
    return NextResponse.json({ configured: true, error: "Couldn't load the record." }, { status: 500 });
  }
  return NextResponse.json(record);
}
