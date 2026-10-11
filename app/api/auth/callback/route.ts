import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

// Exchange the PKCE code from an email link (magic link, sign-up confirmation,
// password reset) for a session, then continue to `next`.
//
// The cookie-store-based server client matters: the session cookies written
// during the exchange are flushed onto the redirect response (a separately
// constructed NextResponse would drop them).
//
// `next` is set by the login actions when they mint the link, and is filtered
// through safeNext — it is part of a URL anyone can craft.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // An expired or already-used link comes back as ?error=…&error_description=…
  // rather than a code. Keep `next` so the retry still lands where they meant.
  if (!code) {
    const reason = searchParams.get("error_description") || searchParams.get("error") || "missing_code";
    return NextResponse.redirect(loginError(origin, reason, next));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(loginError(origin, error.message, next));
  return NextResponse.redirect(`${origin}${next}`);
}

function loginError(origin: string, reason: string, next: string): string {
  const u = new URL("/login", origin);
  u.searchParams.set("error", "auth");
  u.searchParams.set("reason", reason.slice(0, 200));
  if (next !== "/") u.searchParams.set("next", next);
  return u.toString();
}
