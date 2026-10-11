import { NextResponse, type NextRequest } from "next/server";
import { requireUser, isResponse, fail, str } from "@/lib/api";
import { mapClass } from "@/lib/lenses";
import { REOPEN_TTL_MS, listItem, symbolKey, toStored, type AnalysisRow } from "@/lib/analysisStore";
import { copyToUser, findOwn, findShared } from "./store";

const NO_STORE = { "Cache-Control": "private, no-store" };

// GET                      → the member's latest 30 analyses (history list).
// GET ?symbol=SYM[&cls=…]  → the analysis to show for SYM, without running one:
//                            the member's own from the last 24h, else a shared
//                            one from the last 6h (copied into their history —
//                            free). { analysis: null } means "offer to run it".
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const sp = req.nextUrl.searchParams;
  const symbol = str(sp.get("symbol"), 40);

  if (!symbol) {
    // Content is selected only to derive each row's lean and call (a few KB a
    // row); the list itself never ships briefings to the client.
    const { data, error } = await sb.from("analyses")
      .select("id,symbol,query,asset_class,created_at,shared_from,content")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
    if (error) return fail(500, "Couldn't load your analyses — try again.", { code: "db_error" });
    return NextResponse.json({ items: (data ?? []).map((r) => listItem(r as AnalysisRow)) }, { headers: NO_STORE });
  }

  const rawCls = str(sp.get("cls"), 60);
  const cls = rawCls ? mapClass(rawCls) : null;

  const own = await findOwn(sb, user.id, symbol, cls, REOPEN_TTL_MS);
  if (own) return NextResponse.json({ analysis: toStored(own, "own") }, { headers: NO_STORE });

  const hit = await findShared(symbolKey(symbol), cls);
  if (hit) {
    const mine = await copyToUser(sb, user.id, hit, symbol);
    if (mine) return NextResponse.json({ analysis: toStored(mine, mine.id === hit.id ? "own" : "hit") }, { headers: NO_STORE });
    // Couldn't file the copy: serve the briefing, but neither another member's
    // row id nor the deep-tool results they paid for.
    const stored = toStored(hit, "hit");
    return NextResponse.json({ analysis: { ...stored, meta: { ...stored.meta, id: null }, extras: {} } }, { headers: NO_STORE });
  }

  return NextResponse.json({ analysis: null }, { headers: NO_STORE });
}
