import { NextResponse } from "next/server";
import { requireUser, isResponse } from "@/lib/api";
import { getMacroSnapshot, MACRO_SOURCE } from "@/lib/macro";

// Real macro backdrop (rates, curve, inflation, jobs, vol) — via FRED, cached.
//
// Authenticated because it proxies a keyed third-party API. The series update
// daily at most (CPI and payrolls monthly), and lib/macro already holds them
// for an hour in-process, so the browser can keep a copy for half an hour and
// revalidate in the background after that. An empty answer (no key, FRED down)
// is cached only briefly, so the strip comes back soon after the provider does.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  let indicators: Awaited<ReturnType<typeof getMacroSnapshot>> = [];
  try { indicators = await getMacroSnapshot(); } catch { /* degrade to an empty strip */ }
  const cache = indicators.length ? "private, max-age=1800, stale-while-revalidate=3600" : "private, max-age=60";
  return NextResponse.json({ indicators, source: MACRO_SOURCE }, { headers: { "Cache-Control": cache } });
}
