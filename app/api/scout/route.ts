import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { scoutPrompt } from "@/lib/prompts";
import { parseScout } from "@/lib/parsers";

export const maxDuration = 60;

// Surface timely, current candidates to research for the user's themes.
// Returns picks; the cron slice will additionally persist into scout_picks.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { themes?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const themes = Array.isArray(body.themes) ? body.themes.map((t) => String(t)).filter(Boolean) : [];

  try {
    const text = await ask(
      scoutPrompt(themes),
      [{ role: "user", content: `Themes: ${themes.join("; ") || "(none — scan broadly)"}\n\nScout current candidates to research, emphasizing recent catalysts.` }],
      true,
      1100
    );
    return NextResponse.json({ result: parseScout(text) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scout failed" }, { status: 500 });
  }
}
