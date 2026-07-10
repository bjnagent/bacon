import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askStream } from "@/lib/anthropic";
import { analysisPrompt } from "@/lib/prompts";
import { getMacroSnapshot } from "@/lib/macro";
import { getMovingAverages } from "@/lib/market";
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

  // Ground the GF-DMA Health lens with REAL moving averages (equities/ETFs only —
  // the daily series is US-equity data). Real numbers; the model reads the trend.
  let maCtx = "";
  if (/equity|stock|etf|fund/i.test(assetClass) || !assetClass) {
    try {
      const ma = await getMovingAverages(asset);
      if (ma) maCtx = `\n\nReal moving-average structure for the HEALTH (GF-DMA) lens (via market-data provider, as of ${ma.asOf}): last ${ma.price.toFixed(2)}; ${ma.smas.map((s) => `${s.period}D ${s.value.toFixed(2)} (${s.abovePct >= 0 ? "+" : ""}${s.abovePct.toFixed(1)}% vs price)`).join(", ")}. Mechanical read: ${ma.classification}. Use these real figures for the HEALTH lens.`;
    } catch { /* MA optional — HEALTH lens degrades to Limited-data */ }
  }

  return textStreamResponse(
    askStream(
      analysisPrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}${macroCtx}${maCtx}\n\nProduce the full multi-lens BACON briefing using current public information.` }],
      true,
      1700,
      6
    )
  );
}
