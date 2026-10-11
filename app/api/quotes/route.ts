import { NextResponse } from "next/server";
import { requireUser, isResponse, badRequest } from "@/lib/api";
import { getQuotes } from "@/lib/quotes";

// Current prices for a set of symbols. Crypto is real-time; equities are the
// last daily close and say so in the payload — the client must not present a
// delayed close as live.
export const maxDuration = 30;

const MAX_SYMBOLS = 25;
// Tickers, pairs and exchange-suffixed symbols (BRK.B, BTC-USD, EUR/USD, ^VIX).
// Anything else never reaches a provider.
const SYMBOL_RE = /^[A-Za-z0-9.^=/:-]{1,24}$/;

export async function GET(req: Request) {
  // Authenticated: this proxies third-party providers, and an open endpoint
  // would let anyone spend bacon's rate limits with them.
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const raw = new URL(req.url).searchParams.get("symbols") ?? "";
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return NextResponse.json({ quotes: {} });
  const symbols = parts.filter((s) => SYMBOL_RE.test(s)).slice(0, MAX_SYMBOLS);
  if (!symbols.length) return badRequest("No valid symbols in the request.");

  let quotes: Awaited<ReturnType<typeof getQuotes>> = {};
  try { quotes = await getQuotes(symbols); } catch { /* no prices beats a 500: cards render without the chip */ }
  // Cache by what the answer contains. A delayed close doesn't change for
  // hours, so a minute is safe; a real-time crypto price labelled "live" must
  // still be live when it's shown, so a response carrying one is held only
  // briefly (the server's own crypto cache is 20s).
  const anyLive = Object.values(quotes).some((q) => q?.live);
  return NextResponse.json({ quotes }, { headers: { "Cache-Control": anyLive ? "private, max-age=15" : "private, max-age=60" } });
}
