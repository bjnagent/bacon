import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { redTeamPrompt } from "@/lib/prompts";
import { parseDebate } from "@/lib/parsers";

export const maxDuration = 300;

// Red team: attack the investment (10 brutal, specific failure modes), judge
// which are actually likely, and end with an honest Proceed / Stay away call.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { asset?: string; assetClass?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const asset = String(body.asset || "").trim().slice(0, 120);
  const assetClass = String(body.assetClass || "").trim().slice(0, 60);
  if (!asset) return NextResponse.json({ error: "Missing asset" }, { status: 400 });

  try {
    const text = await ask(
      redTeamPrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}\n\nI'm about to invest. Attack it — worst case, 10 reasons I lose my money, then your honest verdict.` }],
      true,
      1400,
      6
    );
    return NextResponse.json({ redteam: parseDebate(text) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Red team failed" }, { status: 500 });
  }
}
