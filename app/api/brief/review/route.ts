import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, badRequest, str } from "@/lib/api";
import { gate } from "@/lib/entitlements";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";
import { ask } from "@/lib/anthropic";
import { briefReviewPrompt } from "@/lib/prompts";
import { parseBriefReview } from "@/lib/parsers";
import { communityPulse } from "@/lib/grok";
import type { StoredBriefItem } from "@/lib/brief";
import { orNull, swallowed } from "@/lib/log";

export const maxDuration = 300;

// "How did it age?" — web-search-grounded review of a past brief. Writes each
// item's outcome + verdict back onto the stored brief (the track record).
//
// A model call, so it is metered: it draws one unit of the monthly "update"
// allowance (route gate "track-update"), refunded if the review fails.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ id?: unknown }>(req);
  if (!body) return badRequest();
  const id = str(body.id, 64);
  if (!id) return badRequest("Missing id");

  const { data: row, error } = await sb.from("daily_briefs").select("id,brief_date,items").eq("id", id).maybeSingle();
  if (error || !row) return fail(404, "Brief not found", { code: "not_found" });
  const items = (row.items ?? []) as StoredBriefItem[];
  if (!items.length) return badRequest("This brief has no ideas to review");

  // The daily abuse cap first, so a runaway loop is stopped before it costs a
  // unit of the monthly allowance.
  if (!(await withinQuota(sb))) return fail(429, QUOTA_MESSAGE, { code: "quota" });
  const g = await gate(sb, user, "track-update");
  if (!g.ok) return g.response;

  try {
    const listing = items.map((o, i) => `${i + 1}. ${o.name} (${o.ticker || "—"}) — horizon ${o.horizon || "?"} — thesis: ${o.thesis}${o.action ? ` — call: ${o.action}${o.target ? ` / ${o.target}` : ""}` : ""} — kill: ${o.checks}`).join("\n");
    // Community pulse joins the assessment: sentiment shift since the call is
    // part of "how did it age" (euphoria then vs silence now is itself a grade).
    const withDeadline = <T,>(p: Promise<T>, ms: number, fallback: T) =>
      Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
    const pulse = await withDeadline(communityPulse(items.map((o) => o.ticker || o.name), "grading past investment calls", undefined, { route: "brief-review", userId: user.id }).catch(orNull("brief-review community pulse")), 12_000, null);
    const pulseCtx = pulse ? `\n\nCURRENT COMMUNITY PULSE on these names (live X via Grok — weigh the sentiment SHIFT since the call in your outcomes):\n${pulse.text}` : "";
    const text = await ask(briefReviewPrompt(String(row.brief_date)), [{ role: "user", content: `Opportunities flagged on ${row.brief_date}:\n${listing}${pulseCtx}\n\nReview what has happened to each since.` }], true, 1400, 6, { route: "brief-review", userId: user.id });
    const review = parseBriefReview(text);
    const reviewed = items.map((o, i) => {
      const match = review.items.find((r) => r.ticker.toUpperCase().includes((o.ticker || o.name).toUpperCase())) ?? review.items[i];
      return match ? { ...o, outcome: match.outcome, verdict: match.verdict } : o;
    });
    const reviewed_at = new Date().toISOString();
    await sb.from("daily_briefs").update({ items: reviewed, reviewed_at }).eq("id", id);
    return NextResponse.json({ items: reviewed, reviewed_at, note: review.note });
  } catch (err) {
    await g.refund();
    // The provider's message stays in the server log; the client gets a sentence.
    swallowed("brief-review", err);
    return fail(502, "The review didn't finish — please try again.", { code: "review_failed" });
  }
}
