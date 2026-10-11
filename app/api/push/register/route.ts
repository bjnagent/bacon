import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, badRequest } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeDeviceToken, parseRegistration } from "@/lib/push";
import { swallowed } from "@/lib/log";

// The iOS app registers its APNs device token here after the user allows
// notifications (lib/client/push.ts), and on every launch after that, which
// refreshes last_seen_at.
//
//   POST   { token, environment: "production" | "sandbox" }  → { ok: true }
//   DELETE { token }                                          → { ok: true }
//
// A device token identifies an app install, not a person: when someone signs
// out and another account signs in on the same phone, the token MOVES to the
// new account (otherwise the first account's alerts would keep arriving).
// That reassignment crosses accounts, which RLS rightly forbids the user's own
// client, so the write goes through the service role — after the caller has
// been authenticated and only ever for their own user id.

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const parsed = parseRegistration(await readJson(req));
  if ("error" in parsed) return badRequest(parsed.error);

  const row = {
    user_id: auth.user.id,
    token: parsed.token,
    platform: "ios",
    environment: parsed.environment,
    last_seen_at: new Date().toISOString(),
  };
  const canAdmin = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = canAdmin ? createAdminClient() : auth.sb;
  const { error } = await sb.from("device_tokens").upsert(row, { onConflict: "token" });
  if (error) {
    swallowed("push.register", error);
    return fail(500, "Couldn't register this device for notifications.");
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const body = await readJson<{ token?: unknown }>(req);
  const token = normalizeDeviceToken(body?.token);
  if (!token) return badRequest("token must be a hex APNs device token");

  // RLS-scoped: a user can only ever remove their own registration.
  const { error } = await auth.sb.from("device_tokens").delete().eq("token", token).eq("user_id", auth.user.id);
  if (error) {
    swallowed("push.unregister", error);
    return fail(500, "Couldn't unregister this device.");
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
