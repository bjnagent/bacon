import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { personasPrompt } from "@/lib/prompts";
import { parseDebate } from "@/lib/parsers"; // generic ===SECTION=== splitter

export const maxDuration = 60;

// Stylized investor takes for the analyzed asset (Buffett/Graham/Lynch/Burry).
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
      personasPrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}\n\nGive the four stylized investor takes using current public information.` }],
      true,
      1100
    );
    return NextResponse.json({ personas: parseDebate(text) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Personas failed" }, { status: 500 });
  }
}
