import { requireUser, isResponse, readJson, fail, str } from "@/lib/api";
import { gate } from "@/lib/entitlements";
import { askStream } from "@/lib/anthropic";
import { propertyOutlookPrompt } from "@/lib/prompts";
import { parseDebate } from "@/lib/parsers";
import { normStance } from "@/lib/lenses";
import { marketByKey, getPropertySeries, computeMarketStats } from "@/lib/property";
import { communityPulse } from "@/lib/grok";
import { recordCalls, getCalibrationMemo, getInstrumentMemo } from "@/lib/calls";
import { textStreamResponse } from "@/lib/streamRoute";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";
import { orNull } from "@/lib/log";

export const maxDuration = 300;

// POST: a web-search-grounded qualitative outlook for one property market,
// seeded with the REAL index stats (the only numbers the model may assert).
// Streams; the parsed result is persisted per user+market after the last chunk.
// Metered (one "update") and needs the property feature; the unit is refunded
// when the stream fails or yields nothing usable.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ market?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });
  const market = marketByKey(str(body.market, 40));
  if (!market) return fail(400, "Unknown market", { code: "bad_request" });
  // Daily abuse cap first (cheap, consumes nothing), then the plan gate.
  if (!(await withinQuota(sb))) return fail(429, QUOTA_MESSAGE, { code: "quota" });
  const g = await gate(sb, user, "property-outlook");
  if (!g.ok) return g.response;

  // raceAbort cancels the Grok call when its 12s deadline loses, instead of
  // leaving a 45s X-search running and billed for a discarded result.
  const raceAbort = <T,>(make: (signal: AbortSignal) => Promise<T>, ms: number, fallback: T): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return make(ctrl.signal).catch(() => fallback).finally(() => clearTimeout(timer));
  };
  const [series, pulse, calibration, instrumentMemo] = await Promise.all([
    getPropertySeries(sb, market.key).catch(orNull(`property series ${market.key}`)),
    raceAbort((signal) => communityPulse([market.label], `${market.country === "SG" ? "Singapore" : "Australia"} property market`, signal, { route: "property", userId: user.id }), 12_000, null),
    getCalibrationMemo(sb),
    // Episodic memory: prior calls on THIS market and how they aged.
    getInstrumentMemo(sb, market.key),
  ]);
  const stats = series ? computeMarketStats(series.bars) : null;
  const fmt = (n: number) => market.unit === "price" ? `${market.currency} ${Math.round(n).toLocaleString("en-US")}` : n.toFixed(1);
  const statsLine = stats
    ? `latest ${market.unit === "price" ? "mean dwelling price" : "index"} ${fmt(stats.latest.close)} as of ${stats.latest.date} (${market.source})${stats.qoqPct != null ? `; QoQ ${stats.qoqPct >= 0 ? "+" : ""}${stats.qoqPct.toFixed(1)}%` : ""}${stats.yoyPct != null ? `; YoY ${stats.yoyPct >= 0 ? "+" : ""}${stats.yoyPct.toFixed(1)}%` : ""}`
    : "no index data available right now — say so and rely only on attributed web_search findings";

  const pulseCtx = pulse ? `\n\nCOMMUNITY PULSE (live X via Grok — weigh in SENTIMENT; noisy, contrarian at extremes):\n${pulse.text}` : "";
  const calCtx = calibration ? `\n\nYOUR CALIBRATION (from your graded past calls — correct for these biases in the VERDICT):\n${calibration}` : "";
  return textStreamResponse(
    askStream(propertyOutlookPrompt(market.label, statsLine), [{ role: "user", content: `Write the current deep view for ${market.label} — policy, rates, supply, district development & major projects, sentiment, rentals, 12-mo scenarios, 5/10-yr long run, the rent-vs-mortgage carry math, and your verdict.${pulseCtx}${calCtx}${instrumentMemo}` }], true, 1800, 6, { route: "property", userId: user.id }),
    async (full, ok) => {
      // Don't persist (or charge for) a truncated or unparseable outlook.
      if (!ok) { await g.refund(); return; }
      const sec = parseDebate(full); // generic ===SECTION=== splitter
      if (!sec.READ) { await g.refund(); return; }
      const bodyJson = {
        read: sec.READ, policy: sec.POLICY || "", rates: sec.RATES || "", supply: sec.SUPPLY || "",
        sentiment: sec.SENTIMENT || "", rental: sec.RENTAL || "", scenarios: sec.SCENARIOS || "",
        development: sec.DEVELOPMENT || "",
        longrun: sec.LONGRUN || "", carry: sec.CARRY || "",
        verdict: sec.VERDICT || "", confirm: sec.CONFIRM || "", kill: sec.KILL || "",
        stance: normStance((sec.VERDICT || "").split(/[·—-]/)[0]), // buy→constructive, avoid→cautious via normStance synonyms? map below
      };
      // normStance doesn't know buy/avoid — map the verdict head explicitly.
      const head = (sec.VERDICT || "").trim().toLowerCase();
      if (head.startsWith("buy")) bodyJson.stance = "constructive";
      else if (head.startsWith("avoid") || head.startsWith("sell")) bodyJson.stance = "cautious";
      else if (head.startsWith("hold")) bodyJson.stance = "mixed";
      await sb.from("property_outlooks").upsert({ user_id: user.id, market_key: market.key, body: bodyJson, created_at: new Date().toISOString() }, { onConflict: "user_id,market_key" });
      // Calibration: the property verdict is a graded call too (12-mo, vs the index).
      if (sec.VERDICT) {
        await recordCalls(sb, user.id, [{
          source: "property", instrument: market.key, action: sec.VERDICT,
          targetText: sec.SCENARIOS || "", horizonDays: 365, crowded: null,
        }]);
      }
    }
  );
}
