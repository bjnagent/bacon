import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// token_hash verification (verifyOtp). Unlike the PKCE code flow, this needs no
// client-side code_verifier, so it works across browsers/devices and with links
// minted by the admin API (scripts/magic-link.mjs) — handy for testing without
// hitting the email rate limit. Point the Supabase Magic Link email template at
// {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email to use it.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") || "email") as EmailOtpType;
  const next = searchParams.get("next") ?? "/";

  if (!token_hash) return NextResponse.redirect(`${origin}/login?error=auth&reason=missing_token`);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) return NextResponse.redirect(`${origin}/login?error=auth&reason=${encodeURIComponent(error.message)}`);
  return NextResponse.redirect(`${origin}${next}`);
}
