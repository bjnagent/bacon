// Apple App Site Association: tells iOS which URLs on this domain open in the
// Bacon app (universal links) and lets iCloud Keychain offer saved passwords
// for the login form inside the app (webcredentials).
//
// Requirements Apple's CDN enforces when it fetches this file: served at
// exactly /.well-known/apple-app-site-association, over HTTPS, as JSON, with no
// redirect. The proxy lets /.well-known/* through without an auth check.
//
// Env: APPLE_TEAM_ID (required; 404 without it) and the bundle id from
// APNS_BUNDLE_ID or CAP_APP_ID (default app.bacon.research). Must match
// ios/App/App/App.entitlements (applinks:/webcredentials: <host>).

/** Order matters: iOS uses the first component that matches a URL. */
const COMPONENTS: Record<string, unknown>[] = [
  // Magic links using the token_hash template verify inside the app's own web
  // view, so the session lands where the user is. (/api/auth/callback is the
  // PKCE flow, whose verifier lives in the browser that asked: never the app.)
  { "/": "/api/auth/confirm", comment: "Email sign-in links (token_hash flow)" },
  { "/": "/api/*", exclude: true, comment: "API, webhooks, auth callbacks" },
  { "/": "/admin*", exclude: true, comment: "Operator console stays in the browser" },
  { "/": "/", comment: "Today" },
  { "/": "/news" },
  { "/": "/watchlist" },
  { "/": "/property" },
  { "/": "/analyze" },
  { "/": "/analyze/*" },
  { "/": "/track-record" },
  { "/": "/account" },
  { "/": "/account/*" },
  { "/": "/onboarding" },
  { "/": "/onboarding/*" },
];

export function GET() {
  const team = process.env.APPLE_TEAM_ID?.trim();
  if (!team) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const bundle = (process.env.APNS_BUNDLE_ID || process.env.CAP_APP_ID || "app.bacon.research").trim();
  const appID = `${team}.${bundle}`;

  const body = {
    applinks: {
      details: [{ appIDs: [appID], components: COMPONENTS }],
    },
    webcredentials: { apps: [appID] },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Apple's CDN re-fetches on its own schedule; an hour at the edge is plenty.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
