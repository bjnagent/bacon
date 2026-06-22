import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { newsPrompt } from "@/lib/prompts";
import { parseNews } from "@/lib/parsers";
import { NEWS_COLUMNS } from "@/lib/types";

export const maxDuration = 60;

// GET: cached headlines. POST: refresh via live search, paraphrased + attributed
// (the copyright rule lives in newsPrompt), persisted as the latest batch.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await sb.from("news_items").select(NEWS_COLUMNS).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { source?: string; focus?: string };
  try { body = await req.json(); } catch { body = {}; }
  const source = String(body.source || "All").slice(0, 60);
  const focus = String(body.focus || "").trim().slice(0, 200);

  try {
    const text = await ask(
      newsPrompt(source, focus),
      [{ role: "user", content: `Source focus: ${source}\nTopic focus: ${focus || "(general markets)"}\n\nSurface the latest market-moving business headlines now.` }],
      true,
      1500
    );
    const result = parseNews(text);
    if (result.items.length) {
      await sb.from("news_items").delete().eq("user_id", user.id);
      await sb.from("news_items").insert(result.items.map((n) => ({
        user_id: user.id,
        headline: n.head,
        source: n.source,
        why: n.why,
        symbol: n.ticker,
        asset_class: n.cls,
        signal: n.signal,
        recency: n.when,
      })));
    }
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "News failed" }, { status: 500 });
  }
}
