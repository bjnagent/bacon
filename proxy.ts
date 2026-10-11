import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages anyone can open without signing in: the landing page, the public house
// scorecard (a track record behind a login proves nothing to the person
// deciding whether to sign up), pricing, and the legal pages the App Store and
// payment providers require to be reachable.
const PUBLIC_PAGES = new Set(["/welcome", "/record", "/pricing"]);
const PUBLIC_PREFIXES = ["/legal/"];

// Next.js 16 renamed the `middleware` file convention to `proxy`. This refreshes
// the Supabase auth session on page requests and redirects signed-out visitors
// to /login (except the login, auth-callback and public pages).
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
  // - ALL /api/* routes authenticate themselves (each handler resolves the user
  //   and returns a proper 401) — running auth here too doubled the latency of
  //   every API call. Cron self-protects with CRON_SECRET; webhooks verify
  //   their own signatures.
  // - PWA + app-link files are fetched by the browser / iOS without credentials.
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/.well-known/") ||
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
  // getClaims() refreshes an expired session (writing the new cookies above)
  // and then verifies the JWT locally against the project's signing keys — no
  // auth-server round trip on every page view.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const isPublic = PUBLIC_PAGES.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (!signedIn && !pathname.startsWith("/login") && !pathname.startsWith("/api/auth") && !isPublic) {
    const url = new URL("/login", request.url);
    // Bring them back to where they were going (a deep link from an email or a
    // notification) once they've signed in.
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
