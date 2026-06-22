import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { analysisPrompt } from "@/lib/prompts";
import { parseBriefing } from "@/lib/parsers";

// Live web search can take 20–40s; allow a longer function timeout on Vercel.
export const maxDuration = 60;

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { asset?: string; assetClass?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const asset = String(body.asset || "").trim();
  const assetClass = String(body.assetClass || "").trim();
  if (!asset) return NextResponse.json({ error: "Missing asset" }, { status: 400 });

  try {
    const text = await ask(
      analysisPrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}\n\nProduce the six-lens BACON briefing using current public information.` }],
      true,
      1100
    );
    const parsed = parseBriefing(text);
    if (parsed.SUMMARY || Object.keys(parsed.lenses).length >= 3) return NextResponse.json({ briefing: parsed });
    return NextResponse.json({ raw: text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: 500 });
  }
}
