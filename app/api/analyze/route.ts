import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askStream } from "@/lib/anthropic";
import { analysisPrompt } from "@/lib/prompts";
import { getMacroSnapshot } from "@/lib/macro";
import { textStreamResponse } from "@/lib/streamRoute";

// Live web search can take 20–40s; stream the briefing so lens panels appear
// as they're written instead of after the whole generation.
export const maxDuration = 300;

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { asset?: string; assetClass?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const asset = String(body.asset || "").trim().slice(0, 120);
  const assetClass = String(body.assetClass || "").trim().slice(0, 60);
  if (!asset) return NextResponse.json({ error: "Missing asset" }, { status: 400 });

  // Ground the Macro lens with the real FRED backdrop (cached). It's context for
  // reasoning, not the asset's own figures — the prompt still web-searches facts.
  let macroCtx = "";
  try {
    const macro = await getMacroSnapshot();
    if (macro.length) macroCtx = `\n\nCurrent macro backdrop (real data via FRED — context for the Macro lens, not this asset's own figures): ${macro.map((m) => `${m.label} ${m.value}${m.unit}`).join(", ")}.`;
  } catch { /* macro optional */ }

  return textStreamResponse(
    askStream(
      analysisPrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}${macroCtx}\n\nProduce the six-lens BACON briefing using current public information.` }],
      true,
      1300,
      8
    )
  );
}
