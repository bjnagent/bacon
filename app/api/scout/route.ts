import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { scoutPrompt } from "@/lib/prompts";
import { parseScout } from "@/lib/parsers";
import { SCOUT_PICK_COLUMNS } from "@/lib/types";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";

export const maxDuration = 300;

// Cached "fresh finds" — picks the background sweep persisted for this user.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await sb.from("scout_picks").select(SCOUT_PICK_COLUMNS).in("kind", ["mover", "theme"]).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ picks: data });
}

// Surface timely, current candidates to research for the user's themes.
// Returns picks; the cron slice will additionally persist into scout_picks.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { themes?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const themes = Array.isArray(body.themes) ? body.themes.map((t) => String(t).slice(0, 80)).filter(Boolean).slice(0, 20) : [];
  if (!(await withinQuota(sb))) return NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 });

  try {
    const text = await ask(
      scoutPrompt(themes),
      [{ role: "user", content: `Themes: ${themes.join("; ") || "(none — scan broadly)"}\n\nScout current candidates to research, emphasizing recent catalysts.` }],
      true,
      1100,
      6
    );
    return NextResponse.json({ result: parseScout(text) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scout failed" }, { status: 500 });
  }
}
