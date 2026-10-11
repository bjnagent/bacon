import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail } from "@/lib/api";

// Set or change the signed-in account's password. Also how someone who signed
// up with a magic link gives themselves a password. The session stays signed in.

// Route files may only export handlers, so this stays module-private.
const MIN_PASSWORD = 8;
// Supabase Auth hashes with bcrypt, which only reads the first 72 bytes —
// refuse longer rather than silently ignoring the tail.
const MAX_PASSWORD_BYTES = 72;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const body = await readJson<{ password?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });
  const password = body.password;
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return fail(400, `Use at least ${MIN_PASSWORD} characters.`, { code: "weak_password" });
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return fail(400, "Use 72 characters or fewer.", { code: "weak_password" });
  }

  const { error } = await auth.sb.auth.updateUser({ password });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "same_password") return fail(400, "That's your current password — choose a new one.", { code });
    // Supabase explains which rule failed (length, character classes, leaked list).
    if (code === "weak_password") return fail(400, error.message || "Choose a stronger password.", { code });
    if (code === "reauthentication_needed" || code === "session_not_found" || error.status === 401) {
      return fail(403, "For your security, sign in again before changing your password.", { code: "reauthentication_needed" });
    }
    console.error("[account/password] update failed", code, error.message);
    return fail(500, "Couldn't update your password — try again.");
  }
  return NextResponse.json({ ok: true });
}
