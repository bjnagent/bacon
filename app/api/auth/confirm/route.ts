import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

// token_hash verification (verifyOtp). Unlike the PKCE code flow, this needs no
// code_verifier cookie, so it works across browsers and devices (a link opened
// in Mail on the phone after asking from the laptop) and with links minted by
// the admin API (scripts/magic-link.mjs). Point the Supabase email templates at:
//
//   Magic link:      {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email
//   Confirm signup:  {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=signup
//   Reset password:  {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
//
// Each type has a sensible landing page when the link carries no `next`.

const TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

const DEFAULT_NEXT: Partial<Record<EmailOtpType, string>> = {
  signup: "/onboarding",
  invite: "/onboarding",
  recovery: "/login/reset",
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const rawType = searchParams.get("type") || "email";
  const type = TYPES.has(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;
  const next = safeNext(searchParams.get("next"), (type && DEFAULT_NEXT[type]) || "/");

  if (!token_hash || !type) return NextResponse.redirect(loginError(origin, token_hash ? "invalid_type" : "missing_token", next));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
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
