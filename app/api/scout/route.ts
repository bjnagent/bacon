import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail } from "@/lib/api";
import { askCheap } from "@/lib/ai";
import { scoutPrompt } from "@/lib/prompts";
import { parseScout } from "@/lib/parsers";
import { SCOUT_PICK_COLUMNS } from "@/lib/types";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";
import { gate } from "@/lib/entitlements";

export const maxDuration = 300;

// Cached "fresh finds" — the movers and theme picks the nightly sweep
// persisted for this member. A plain DB read: free to every plan.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const { data, error } = await auth.sb.from("scout_picks").select(SCOUT_PICK_COLUMNS).in("kind", ["mover", "theme"]).order("created_at", { ascending: false });
  if (error) return fail(500, "Couldn't load fresh finds — try again.", { code: "db_error" });
  return NextResponse.json({ picks: data });
}

// On demand: surface timely candidates to research for the member's themes.
// A web-searched model call, so it is metered (one "update") and needs the
// personal-brief feature.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ themes?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });
  const themes = Array.isArray(body.themes) ? body.themes.map((t) => String(t).trim().slice(0, 80)).filter(Boolean).slice(0, 20) : [];

  // The abuse cap first (it is per day and cheap), then the plan gate, which
  // consumes a unit — so a request the daily cap rejects never costs one.
  if (!(await withinQuota(sb))) return fail(429, QUOTA_MESSAGE, { code: "quota" });
  const g = await gate(sb, user, "scout");
  if (!g.ok) return g.response;

  try {
    // The cheap tier (Gemini with search grounding, falling back to the bulk
    // Claude model) — the same path the nightly scout already takes. Pricing
    // budgets ~$0.03 per refresh; Sonnet with six searches is several times that.
    const text = await askCheap(
      scoutPrompt(themes),
      [{ role: "user", content: `Themes: ${themes.join("; ") || "(none — scan broadly)"}\n\nScout current candidates to research, emphasizing recent catalysts.` }],
      true,
      1100,
      6,
      { route: "scout", userId: user.id },
    );
    const result = parseScout(text);
    // A reply with no parseable pick is a failed run, not an empty market:
    // give the unit back rather than charge for a blank card.
    if (!result.picks.length) {
      await g.refund();
      return fail(502, "Couldn't find ideas right now — try again in a minute.", { code: "empty" });
    }
    return NextResponse.json({ result, remaining: g.remaining });
  } catch {
    await g.refund();
    return fail(502, "Scouting failed — try again in a minute.", { code: "upstream" });
  }
}
