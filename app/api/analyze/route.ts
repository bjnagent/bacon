import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askStream } from "@/lib/anthropic";
import { analysisPrompt } from "@/lib/prompts";
import { getMacroSnapshot } from "@/lib/macro";
import { getMovingAverages, cleanTicker } from "@/lib/market";
import { communityPulse } from "@/lib/grok";
import { parseBriefing } from "@/lib/parsers";
import { recordCalls, parseVerdictCall, getCalibrationMemo } from "@/lib/calls";
import { textStreamResponse } from "@/lib/streamRoute";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";

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
  if (!(await withinQuota(sb))) return NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 });

  // Ground the Macro lens with the real FRED backdrop (cached). It's context for
  // reasoning, not the asset's own figures — the prompt still web-searches facts.
  let macroCtx = "";
  try {
    const macro = await getMacroSnapshot();
    if (macro.length) macroCtx = `\n\nCurrent macro backdrop (real data via FRED — context for the Macro lens, not this asset's own figures): ${macro.map((m) => `${m.label} ${m.value}${m.unit}`).join(", ")}.`;
  } catch { /* macro optional */ }

  // Ground the GF-DMA Health lens with REAL moving averages (equities/ETFs only —
  // the daily series is US-equity data), fetch the community pulse (Grok/X) and
  // the calibration memo in parallel. A short deadline keeps first-byte fast.
  const withDeadline = <T,>(p: Promise<T>, ms: number, fallback: T) =>
    Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
  const isEquity = /equity|stock|etf|fund/i.test(assetClass) || !assetClass;
  const [ma, pulse, calibration] = await Promise.all([
    isEquity ? getMovingAverages(asset).catch(() => null) : Promise.resolve(null),
    withDeadline(communityPulse([asset], `the asset ${asset}`).catch(() => null), 12_000, null),
    getCalibrationMemo(sb),
  ]);
  const maCtx = ma
    ? `\n\nReal moving-average structure for the HEALTH (GF-DMA) lens (via market-data provider, as of ${ma.asOf}): last ${ma.price.toFixed(2)}; ${ma.smas.map((s) => `${s.period}D ${s.value.toFixed(2)} (${s.abovePct >= 0 ? "+" : ""}${s.abovePct.toFixed(1)}% vs price)`).join(", ")}. Mechanical read: ${ma.classification}. Use these real figures for the HEALTH lens.`
    : "";
  const pulseCtx = pulse ? `\n\nCOMMUNITY PULSE (live X via Grok — noisy, contrarian at extremes; weigh crowding in the SIGNALS lens and the VERDICT):\n${pulse.text}` : "";
  const calCtx = calibration ? `\n\nYOUR CALIBRATION (measured from your graded past calls — correct for these biases in the VERDICT):\n${calibration}` : "";

  return textStreamResponse(
    askStream(
      analysisPrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}${macroCtx}${maCtx}${pulseCtx}${calCtx}\n\nProduce the full multi-lens BACON briefing using current public information.` }],
      true,
      1700,
      6
    ),
    async (full, ok) => {
      if (!ok) return;
      // Calibration: file the verdict as a graded call (12-mo horizon).
      const v = parseVerdictCall(parseBriefing(full).VERDICT);
      if (!v) return;
      const key = cleanTicker(asset) ?? asset.toUpperCase();
      await recordCalls(sb, user.id, [{
        source: "analyze", instrument: asset, action: v.action, conviction: v.conviction,
        targetText: v.targetText, horizonDays: 365,
        crowded: pulse?.crowding.get(key) ?? null,
      }]);
    }
  );
}
