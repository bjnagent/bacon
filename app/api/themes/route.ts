import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, str } from "@/lib/api";
import { overCap, isDuplicate } from "@/app/api/watchlist/caps";

// Scout themes — per member, RLS-scoped. GET list / POST add / DELETE remove.
// Themes steer the nightly scout and the personal brief, so the plan caps how
// many one account can ask the sweep to cover.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const { data, error } = await auth.sb.from("themes").select("id,label,created_at").order("created_at", { ascending: true }).limit(500);
  if (error) return fail(500, "Couldn't load your themes — try again.", { code: "db_error" });
  return NextResponse.json({ themes: data });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ label?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });
  const label = str(body.label, 80);
  if (!label) return fail(400, "Name the theme first.", { code: "bad_request" });

  const capped = await overCap(sb, user, "themes", "themesMax");
  if (capped) {
    // Escaped: a theme like "50% margin" must match itself, not act as a pattern.
    const { data: existing } = await sb.from("themes").select("id").ilike("label", label.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
    if (existing) return fail(409, "Already added", { code: "duplicate", duplicate: true });
    return capped;
  }

  // The (user_id, lower(label)) unique index decides case-insensitive
  // duplicates atomically — no check-then-insert race.
  const { data, error } = await sb.from("themes").insert({ user_id: user.id, label }).select("id,label,created_at").single();
  if (isDuplicate(error)) return fail(409, "Already added", { code: "duplicate", duplicate: true });
  if (error) return fail(500, "Couldn't add that theme — try again.", { code: "db_error" });
  return NextResponse.json({ theme: data });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const body = await readJson<{ id?: unknown }>(req);
  const id = str(body?.id, 64);
  if (!id) return fail(400, "Missing id", { code: "bad_request" });

  const { error } = await auth.sb.from("themes").delete().eq("id", id);
  if (error) return fail(500, "Couldn't remove that theme — try again.", { code: "db_error" });
  return NextResponse.json({ ok: true });
}
