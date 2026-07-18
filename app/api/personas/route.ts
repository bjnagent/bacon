import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { personasPrompt } from "@/lib/prompts";
import { parseDebate } from "@/lib/parsers"; // generic ===SECTION=== splitter
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";

export const maxDuration = 300;

// Stylized investor takes for the analyzed asset (Buffett/Graham/Lynch/Burry).
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { asset?: string; assetClass?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const asset = String(body.asset || "").trim().slice(0, 120);
  const assetClass = String(body.assetClass || "").trim().slice(0, 60);
  if (!asset) return NextResponse.json({ error: "Missing asset" }, { status: 400 });
  if (!(await withinQuota(sb))) return NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 });

  try {
    const text = await ask(
      personasPrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}\n\nGive the four stylized investor takes using current public information.` }],
      true,
      1100,
      6
    );
    return NextResponse.json({ personas: parseDebate(text) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Personas failed" }, { status: 500 });
  }
}
