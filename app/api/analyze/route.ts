import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askStream } from "@/lib/anthropic";
import { analysisPrompt } from "@/lib/prompts";
import { getMacroSnapshot } from "@/lib/macro";
import { getMovingAverages, cleanTicker } from "@/lib/market";
import { getFundamentals, deriveValuation, formatFundamentals } from "@/lib/fundamentals";
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

  // All grounding fetches run in ONE deadline-bounded parallel fan-out so none of
  // them (macro included — previously a serial, un-timed await) can hold up the
  // stream's first byte. raceAbort actually CANCELS the upstream call when its
  // deadline loses, instead of leaving it running and billing for a discarded
  // result (Grok's X search, the SEC fan-out).
  const withDeadline = <T,>(p: Promise<T>, ms: number, fallback: T) =>
    Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
  const raceAbort = <T,>(make: (signal: AbortSignal) => Promise<T>, ms: number, fallback: T): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return make(ctrl.signal).catch(() => fallback).finally(() => clearTimeout(timer));
  };
  const isEquity = /equity|stock|etf|fund/i.test(assetClass) || !assetClass;
  // Fundamentals are company filings — only meaningful for individual stocks
  // (not ETFs/funds/FX/commodities). `sb` gives the shared DB cache; the signal
  // lets the 8s deadline cancel a slow SEC fetch.
  const isStock = /equity|stock/i.test(assetClass) || !assetClass;
  const [macro, ma, fundamentals, pulse, calibration] = await Promise.all([
    withDeadline(getMacroSnapshot().catch(() => []), 4000, [] as Awaited<ReturnType<typeof getMacroSnapshot>>),
    isEquity ? getMovingAverages(asset).catch(() => null) : Promise.resolve(null),
    isStock ? raceAbort((signal) => getFundamentals(cleanTicker(asset) ?? asset, sb, signal), 8000, null) : Promise.resolve(null),
    raceAbort((signal) => communityPulse([asset], `the asset ${asset}`, signal), 12_000, null),
    getCalibrationMemo(sb),
  ]);
  // Real FRED backdrop — context for the Macro lens, not the asset's own figures.
  const macroCtx = macro.length
    ? `\n\nCurrent macro backdrop (real data via FRED — context for the Macro lens, not this asset's own figures): ${macro.map((m) => `${m.label} ${m.value}${m.unit}`).join(", ")}.`
    : "";
  // Real SEC-filed fundamentals ground the FUNDAMENTAL & VALUATION lenses; the
  // live close (from the MA fetch) turns filed EPS/shares into a real P/E, market
  // cap and PEG instead of searched guesses.
  const fundCtx = fundamentals
    ? formatFundamentals(fundamentals, ma?.price ? deriveValuation(fundamentals, ma.price) : null)
    : "";
  const maCtx = ma
    ? `\n\nReal moving-average structure for the HEALTH (GF-DMA) lens (via market-data provider, as of ${ma.asOf}): last ${ma.price.toFixed(2)}; ${ma.smas.map((s) => `${s.period}D ${s.value.toFixed(2)} (${s.abovePct >= 0 ? "+" : ""}${s.abovePct.toFixed(1)}% vs price)`).join(", ")}. Mechanical read: ${ma.classification}. Use these real figures for the HEALTH lens.`
    : "";
  const pulseCtx = pulse ? `\n\nCOMMUNITY PULSE (live X via Grok — noisy, contrarian at extremes; weigh crowding in the SIGNALS lens and the VERDICT):\n${pulse.text}` : "";
  const calCtx = calibration ? `\n\nYOUR CALIBRATION (measured from your graded past calls — correct for these biases in the VERDICT):\n${calibration}` : "";

  return textStreamResponse(
    askStream(
      analysisPrompt(),
      [{ role: "user", content: `Asset: ${asset}\nAsset class: ${assetClass}${macroCtx}${maCtx}${fundCtx}${pulseCtx}${calCtx}\n\nProduce the full multi-lens BACON briefing using current public information.` }],
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
