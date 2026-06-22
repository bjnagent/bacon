import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchange the magic-link/OAuth code for a session. Using the cookie-store-based
// server client ensures the session cookies set during the exchange are flushed
// onto the redirect response (a separate NextResponse would drop them).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) return NextResponse.redirect(`${origin}/login?error=auth&reason=missing_code`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth&reason=${encodeURIComponent(error.message)}`);
  return NextResponse.redirect(`${origin}${next}`);
}
