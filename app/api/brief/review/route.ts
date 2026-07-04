import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { briefReviewPrompt } from "@/lib/prompts";
import { parseBriefReview } from "@/lib/parsers";
import type { StoredBriefItem } from "@/lib/brief";

export const maxDuration = 60;

// "How did it age?" — web-search-grounded review of a past brief. Writes each
// item's outcome + verdict back onto the stored brief (the track record).
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const id = String(body.id || "").trim().slice(0, 64);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: row, error } = await sb.from("daily_briefs").select("id,brief_date,items").eq("id", id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  const items = (row.items ?? []) as StoredBriefItem[];
  if (!items.length) return NextResponse.json({ error: "Brief has no items" }, { status: 400 });

  try {
    const listing = items.map((o, i) => `${i + 1}. ${o.name} (${o.ticker || "—"}) — horizon ${o.horizon || "?"} — thesis: ${o.thesis} — kill: ${o.checks}`).join("\n");
    const text = await ask(briefReviewPrompt(String(row.brief_date)), [{ role: "user", content: `Opportunities flagged on ${row.brief_date}:\n${listing}\n\nReview what has happened to each since.` }], true, 1400, 5);
    const review = parseBriefReview(text);
    const reviewed = items.map((o, i) => {
      const match = review.items.find((r) => r.ticker.toUpperCase().includes((o.ticker || o.name).toUpperCase())) ?? review.items[i];
      return match ? { ...o, outcome: match.outcome, verdict: match.verdict } : o;
    });
    const reviewed_at = new Date().toISOString();
    await sb.from("daily_briefs").update({ items: reviewed, reviewed_at }).eq("id", id);
    return NextResponse.json({ items: reviewed, reviewed_at, note: review.note });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Review failed" }, { status: 500 });
  }
}
