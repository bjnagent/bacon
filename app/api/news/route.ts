import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, str } from "@/lib/api";
import { gate } from "@/lib/entitlements";
import { askCheap } from "@/lib/ai";
import { newsPrompt } from "@/lib/prompts";
import { parseNews } from "@/lib/parsers";
import { NEWS_COLUMNS, NEWS_COLUMNS_LEGACY } from "@/lib/types";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";
import { swallowed } from "@/lib/log";

export const maxDuration = 300;

// GET: cached headlines. POST: refresh via live search, paraphrased + attributed
// (the copyright rule lives in newsPrompt), persisted as the latest batch.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const read = (cols: string) => sb.from("news_items").select(cols).eq("user_id", user.id).order("created_at", { ascending: false });
  let { data, error } = await read(NEWS_COLUMNS);
  // 42703 = undefined column: the `lean` migration hasn't run yet. Serve the
  // headlines without it rather than failing the whole pane.
  if (error?.code === "42703") ({ data, error } = await read(NEWS_COLUMNS_LEGACY));
  if (error) {
    swallowed("news: read", error);
    return fail(500, "Couldn't load headlines — please try again.", { code: "read_failed" });
  }
  return NextResponse.json({ items: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  // The body is optional (both fields default), so a missing or malformed one
  // is treated as "no preferences" rather than a 400.
  const body = (await readJson<{ source?: unknown; focus?: unknown }>(req)) ?? {};
  const source = str(body.source, 60) || "All";
  const focus = str(body.focus, 200);

  // Daily anti-abuse cap, then the plan's monthly refresh allowance — both
  // before the paid model call, and the unit is handed back if it fails.
  if (!(await withinQuota(sb))) return fail(429, QUOTA_MESSAGE, { code: "daily_cap" });
  const g = await gate(sb, user, "news");
  if (!g.ok) return g.response;

  try {
    const text = await askCheap(
      newsPrompt(source, focus),
      [{ role: "user", content: `Source focus: ${source}\nTopic focus: ${focus || "(general markets)"}\n\nSurface the latest market-moving business headlines now.` }],
      true,
      1500,
      6,
      { route: "news", userId: user.id }
    );
    const result = parseNews(text);
    if (!result.items.length) {
      // Nothing usable came back: not worth a unit of the allowance, and the
      // cached batch is left exactly as it was.
      await g.refund();
      return fail(502, "Couldn't find fresh headlines just now — please try again in a few minutes.", { code: "empty" });
    }
    // Atomic replace (delete+insert in one tx) so a failed insert can't leave
    // the user's cached headlines wiped with nothing to replace them.
    await sb.rpc("replace_news", { p_user: user.id, p_rows: result.items.map((n) => ({
      headline: n.head,
      source: n.source,
      why: n.why,
      symbol: n.ticker,
      asset_class: n.cls,
      signal: n.signal,
      lean: n.lean,
      recency: n.when,
    })) });
    return NextResponse.json({ result, remaining: g.remaining }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    swallowed("news: refresh", err);
    await g.refund();
    return fail(502, "Couldn't reach the news sources — please try again.", { code: "upstream_failed" });
  }
}
