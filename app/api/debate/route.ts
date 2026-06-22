import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { debatePrompt } from "@/lib/prompts";
import { parseDebate } from "@/lib/parsers";

export const maxDuration = 60;

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
      debatePrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}\n\nRun the bull-vs-bear debate using current public information.` }],
      true,
      1100
    );
    return NextResponse.json({ debate: parseDebate(text) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Debate failed" }, { status: 500 });
  }
}
