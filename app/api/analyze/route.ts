import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askStream } from "@/lib/anthropic";
import { analysisPrompt } from "@/lib/prompts";
import { getMacroSnapshot } from "@/lib/macro";
import { getMovingAverages, cleanTicker } from "@/lib/market";
import { getFundamentals, deriveValuation, formatFundamentals } from "@/lib/fundamentals";
import { communityPulse } from "@/lib/grok";
import { parseBriefing } from "@/lib/parsers";
import { recordCalls, parseVerdictCall, getCalibrationMemo, getInstrumentMemo } from "@/lib/calls";
import { textStreamResponse } from "@/lib/streamRoute";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";
import { orEmpty, orNull } from "@/lib/log";
import { resolveSymbol, unverified } from "@/lib/symbols";

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

  // Resolve what the user typed to a symbol that actually exists, BEFORE
  // anything is priced. This is the fix for the bug that produced a Nike
  // briefing full of 2025 figures: "Nike" extracted to "NIKE", which is listed
  // nowhere, so the price fetch and the SEC fetch both quietly returned null
  // and the model supplied the missing numbers from memory.
  //
  // Bounded and fail-safe: if the SEC index is slow or down, this returns
  // exactly what the old code used — cleanTicker's extraction — flagged
  // unverified so the prompt can say the figures are unavailable.
  const resolved = isEquity
    ? await raceAbort((signal) => resolveSymbol(asset, signal), 3500, unverified(asset))
    : unverified(asset);
  const symbol = resolved.symbol ?? cleanTicker(asset) ?? asset;

  const [macro, ma, fundamentals, pulse, calibration, instrumentMemo] = await Promise.all([
    withDeadline(getMacroSnapshot().catch(orEmpty("analyze: macro snapshot")), 4000, [] as Awaited<ReturnType<typeof getMacroSnapshot>>),
    isEquity ? getMovingAverages(symbol).catch(orNull(`analyze: moving averages ${symbol}`)) : Promise.resolve(null),
    isStock ? raceAbort((signal) => getFundamentals(symbol, sb, signal), 8000, null) : Promise.resolve(null),
    raceAbort((signal) => communityPulse([asset], `the asset ${asset}`, signal, { route: "analyze", userId: user.id }), 12_000, null),
    getCalibrationMemo(sb),
    // Episodic memory: what we called on THIS name before, and how it aged.
    getInstrumentMemo(sb, asset),
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

  // Say what is MISSING, out loud.
  //
  // Every grounding fetch above degrades to null on failure, which is right —
  // a dead provider should not fail the request. What was wrong is that the
  // block then simply vanished, and an absent block is indistinguishable from
  // one that was never relevant. The model cannot tell "no filings exist for
  // this asset class" from "the filings lookup failed", so it does the helpful
  // thing and fills the hole from memory. Naming the gap is what turns a silent
  // failure into a stated one — the same lesson as lib/log.ts.
  const gaps: string[] = [];
  if (isStock && !resolved.verified) gaps.push(`"${asset}" could not be matched to a listed symbol, so nothing below is grounded in that company's own data`);
  if (isEquity && !ma) gaps.push("no current price or moving-average structure could be retrieved");
  if (isStock && !fundamentals) gaps.push("no SEC-filed fundamentals could be retrieved");
  const gapCtx = gaps.length
    ? `\n\nDATA AVAILABILITY — READ BEFORE WRITING: ${gaps.join("; ")}. You therefore have NO verified figures for the affected lenses. Do NOT state a share price, market cap, P/E, revenue, margin or earnings number from memory — anything you remember is likely a year or more out of date. Search for it and name the period you found, or mark the lens [Limited-data]. Saying "I could not verify a current figure" is correct here; a confident stale number is not.`
    : "";

  return textStreamResponse(
    askStream(
      analysisPrompt(),
      [{ role: "user", content: `Asset: ${asset}${resolved.verified && resolved.symbol && resolved.how === "name" ? ` (resolved to ${resolved.symbol})` : ""}\nAsset class: ${assetClass}${macroCtx}${maCtx}${fundCtx}${pulseCtx}${calCtx}${instrumentMemo}${gapCtx}\n\nProduce the full multi-lens BACON briefing using current public information.` }],
      true,
      1700,
      6,
      { route: "analyze", userId: user.id }
    ),
    async (full, ok) => {
      if (!ok) return;
      // Calibration: file the verdict as a graded call (12-mo horizon).
      const v = parseVerdictCall(parseBriefing(full).VERDICT);
      if (!v) return;
      // The resolved symbol, so the calibration loop grades this call against the
      // right company. Filing it as "NIKE" would have priced it against nothing.
      const key = symbol.toUpperCase();
      await recordCalls(sb, user.id, [{
        source: "analyze",
        // File the RESOLVED symbol when we have one. Filing the typed name meant
        // grading later ran cleanTicker("Nike") -> "NIKE", found no series, and
        // silently never graded the call at all.
        instrument: resolved.verified && resolved.symbol ? resolved.symbol : asset,
        action: v.action, conviction: v.conviction,
        targetText: v.targetText, horizonDays: 365,
        // Crowding is keyed by whatever ticker the pulse model wrote, so try the
        // resolved symbol first and the extracted one as a fallback.
        crowded: pulse?.crowding.get(key) ?? pulse?.crowding.get((cleanTicker(asset) ?? "").toUpperCase()) ?? null,
      }]);
    }
  );
}
