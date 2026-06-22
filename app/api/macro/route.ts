import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMacroSnapshot, MACRO_SOURCE } from "@/lib/macro";

// Real macro backdrop (rates, curve, inflation, jobs, vol) — via FRED, cached.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const indicators = await getMacroSnapshot();
    return NextResponse.json({ indicators, source: MACRO_SOURCE });
  } catch {
    return NextResponse.json({ indicators: [], source: MACRO_SOURCE });
  }
}
