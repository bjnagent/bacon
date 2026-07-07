import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed the `middleware` file convention to `proxy`. This refreshes
// the Supabase auth session on every request and redirects unauthenticated users
// to /login (except the login and auth-callback routes).
export async function proxy(request: NextRequest) {
  // Safety net for the auth code exchange. Supabase magic links sometimes deliver
  // the PKCE `?code=` to the Site URL root instead of /api/auth/callback (e.g. when
  // the callback URL isn't in the redirect allow-list). Route any stray code to the
  // callback handler, which exchanges it for a session and lands the user home.
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.pathname.startsWith("/api/auth/callback")) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/callback";
    return NextResponse.redirect(url);
  }

  // Fast paths that skip the session round-trip entirely:
  // - ALL /api/* routes authenticate themselves (each handler calls getUser and
  //   returns a proper 401) — running auth here too doubled the latency of
  //   every API call. Cron self-protects with CRON_SECRET; health is public.
  // - PWA files (manifest, sw, offline, icons) are fetched by the browser
  //   without credentials, so they must be public for install to work.
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/") ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/offline" ||
    pathname.startsWith("/icons/")
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  // /welcome is the public splash page (intro + PWA install). It stays on the
  // session-refresh path — not the fast path — so its login/cockpit CTA is
  // accurate even when the access token needs a refresh.
  if (!user && !request.nextUrl.pathname.startsWith("/login") && !request.nextUrl.pathname.startsWith("/api/auth") && request.nextUrl.pathname !== "/welcome") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
