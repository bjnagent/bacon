import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail } from "@/lib/api";
import { requireFeature } from "@/lib/entitlements";
import {
  SETTINGS_COLUMNS, normalizeSettings, parseSettingsPatch,
} from "@/components/account/settings";

// Per-user preferences (nightly brief cadence, alerts, voices, news prefs,
// push, time zone), RLS-scoped to the signed-in account.
//
// Turning a paid feature ON is checked against the plan here, not just hidden
// in the UI: an old client or a hand-written request must not be able to
// switch on a nightly sweep the plan doesn't pay for. Turning anything OFF is
// always allowed — nobody should need a plan to stop email.

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Postgres "undefined column": the database is behind supabase/schema.sql. */
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|schema cache/i.test(e.message ?? ""));

export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  let { data, error } = await sb.from("settings").select(SETTINGS_COLUMNS).eq("user_id", user.id).maybeSingle();
  if (isMissingColumn(error)) {
    // An older database (latest migration not yet applied) still answers, with
    // defaults for the columns it lacks, rather than breaking every screen
    // that reads settings.
    ({ data, error } = await sb.from("settings").select("*").eq("user_id", user.id).maybeSingle());
  }
  if (error) {
    console.error("[settings] read failed", error.message);
    return fail(500, "Couldn't load your settings — try again.");
  }
  return NextResponse.json({ settings: normalizeSettings(data as Record<string, unknown> | null) }, { headers: NO_STORE });
}

export async function PATCH(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });
  const parsed = parseSettingsPatch(body);
  if (!parsed.ok) return fail(400, parsed.error, { code: "bad_request" });

  for (const feature of parsed.enabling) {
    const check = await requireFeature(sb, user, feature);
    if (!check.ok) return check.response;
  }

  const patch = { ...parsed.patch, updated_at: new Date().toISOString() };

  // Update first, insert only if there was no row. The signup trigger creates
  // the row, so the insert path is for accounts that predate it; a racing
  // second insert (unique violation) falls back to the update.
  let { data, error } = await sb.from("settings").update(patch).eq("user_id", user.id).select("user_id");
  if (!error && (!data || data.length === 0)) {
    const ins = await sb.from("settings").insert({ user_id: user.id, ...patch }).select("user_id");
    if (ins.error?.code === "23505") ({ data, error } = await sb.from("settings").update(patch).eq("user_id", user.id).select("user_id"));
    else ({ data, error } = ins);
  }
  if (error) {
    console.error("[settings] write failed", error.message);
    if (isMissingColumn(error)) return fail(503, "This setting needs a database update before it can be saved.", { code: "schema_outdated" });
    return fail(500, "Couldn't save that — try again.");
  }
  return NextResponse.json({ ok: true, settings: parsed.patch }, { headers: NO_STORE });
}
