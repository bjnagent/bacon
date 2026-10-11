import { NextResponse, type NextRequest } from "next/server";
import { requireUser, isResponse, readJson, fail } from "@/lib/api";
import { ROW_COLUMNS, isUuid, mergeExtras, parseExtrasPatch, toStored, toolExtras, type AnalysisRow } from "@/lib/analysisStore";

const NO_STORE = { "Cache-Control": "private, no-store" };
const notFound = () => fail(404, "That analysis isn't in your history.", { code: "not_found" });

// One analysis in the member's history. RLS scopes every query to its owner,
// so another member's id simply reads as not found.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const { data, error } = await auth.sb.from("analyses").select(ROW_COLUMNS).eq("id", id).maybeSingle();
  if (error) return fail(500, "Couldn't load that analysis — try again.", { code: "db_error" });
  if (!data) return notFound();
  const row = data as AnalysisRow;
  return NextResponse.json({ analysis: toStored(row, "own") }, { headers: NO_STORE });
}

/** PATCH { extras: { debate?, personas?, redteam?, chain? } } — merged, never replaced. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const body = await readJson<{ extras?: unknown }>(req);
  const patch = body ? parseExtrasPatch(body.extras) : null;
  if (!patch) return fail(400, "Only debate, personas, redteam and chain results can be saved.", { code: "bad_request" });

  const { data, error } = await auth.sb.from("analyses").select("extras").eq("id", id).maybeSingle();
  if (error) return fail(500, "Couldn't save that — try again.", { code: "db_error" });
  if (!data) return notFound();
  const extras = mergeExtras((data as { extras?: unknown }).extras, patch);
  const { error: upErr } = await auth.sb.from("analyses").update({ extras }).eq("id", id);
  if (upErr) return fail(500, "Couldn't save that — try again.", { code: "db_error" });
  return NextResponse.json({ extras: toolExtras(extras) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const { error } = await auth.sb.from("analyses").delete().eq("id", id);
  if (error) return fail(500, "Couldn't remove that — try again.", { code: "db_error" });
  return NextResponse.json({ ok: true });
}
