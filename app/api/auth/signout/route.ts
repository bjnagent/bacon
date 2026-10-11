import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Sign out: clear the Supabase session and land on /login.
//
// POST only, on purpose. A GET sign-out can be triggered by any page that
// embeds <img src=".../api/auth/signout"> — a nuisance logout CSRF. The app's
// sign-out control is a <form method="post">.
//
// 303 (not the default 307) so the browser follows with a GET; a 307 would
// re-POST the form body to /login.
export async function POST(request: NextRequest) {
  const dest = new URL("/login?signedout=1", request.url);
  let response = NextResponse.redirect(dest, 303);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(dest, 303);
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // signOut revokes the refresh token server-side and clears the cookies. If the
  // auth server can't be reached it returns an error and leaves the cookies in
  // place — so expire them ourselves: what the user asked for is that THIS
  // browser stops being signed in, and that must not depend on the network.
  const { error } = await supabase.auth.signOut().catch((e: unknown) => ({ error: e }));
  if (error) {
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-")) response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }
  return response;
}
