import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuotes } from "@/lib/quotes";

// Current prices for a set of symbols. Crypto is real-time; equities are the
// last daily close and say so in the payload — the client must not present a
// delayed close as live.
export const maxDuration = 30;

const MAX_SYMBOLS = 25;

export async function GET(req: Request) {
  // Authenticated: this proxies third-party providers, and an open endpoint
  // would let anyone spend bacon's rate limits with them.
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("symbols") ?? "";
  const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_SYMBOLS);
  if (!symbols.length) return NextResponse.json({ quotes: {} });

  const quotes = await getQuotes(symbols);
  // Short cache: long enough to absorb a burst of card renders, short enough
  // that a "live" crypto price is still live.
  return NextResponse.json({ quotes }, { headers: { "Cache-Control": "private, max-age=15" } });
}
