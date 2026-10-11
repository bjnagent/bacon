// The shared shape of the four deep tools (debate, personas, red team, chain
// map) — not a route. Each is one web-searched model call that answers in
// ===SECTION=== blocks; what differs is the prompt, the question and the plan
// feature. Keeping the plumbing here means the four can't drift apart on the
// things that matter: validation before metering, metering before spending,
// a refund when the work fails, and saving the result onto the analysis so
// reopening it never bills the same tool twice.

import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, str } from "@/lib/api";
import { gate } from "@/lib/entitlements";
import { ask } from "@/lib/anthropic";
import { parseDebate } from "@/lib/parsers";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";
import { cleanToolResult, isUuid, type ExtraKey } from "@/lib/analysisStore";
import { saveToolResult } from "./store";

export interface DeepToolSpec {
  key: ExtraKey;
  system: () => string;
  question: (asset: string, assetClass: string) => string;
  maxTokens: number;
  /** What failed, in the member's words: "Couldn't run the debate". */
  failure: string;
}

export async function runDeepTool(req: Request, spec: DeepToolSpec): Promise<Response> {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ asset?: unknown; assetClass?: unknown; analysisId?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });
  const asset = str(body.asset, 120);
  const assetClass = str(body.assetClass, 60);
  if (!asset) return fail(400, "Missing asset", { code: "bad_request" });
  const analysisId = isUuid(body.analysisId) ? body.analysisId : null;

  if (!(await withinQuota(sb))) return fail(429, QUOTA_MESSAGE, { code: "daily_quota" });
  const g = await gate(sb, user, spec.key);
  if (!g.ok) return g.response;

  let result: Record<string, string> | null = null;
  try {
    const text = await ask(
      spec.system(),
      [{ role: "user", content: spec.question(asset, assetClass) }],
      true,
      spec.maxTokens,
      6,
      { route: spec.key, userId: user.id },
    );
    result = cleanToolResult(parseDebate(text));
  } catch {
    result = null;
  }
  // No sections back is a failed run, not a thin one: the member keeps the unit.
  if (!result) {
    await g.refund();
    return fail(502, `${spec.failure} — please try again.`, { code: "upstream_failed" });
  }

  const saved = analysisId ? await saveToolResult(sb, analysisId, spec.key, result) : false;
  return NextResponse.json({ [spec.key]: result, saved });
}
