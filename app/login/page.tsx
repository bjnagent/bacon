import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import BaconMark from "@/components/BaconMark";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; reason?: string }> }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect("/");
  const sp = await searchParams;

  async function handleLogin(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    // Prefer an explicit canonical URL, but fall back to the actual request host
    // so magic links work on whatever domain serves the app — even if
    // NEXT_PUBLIC_SITE_URL isn't set on the deployment.
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const origin = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "");
    const sb = await createClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/api/auth/callback` },
    });
    redirect(error ? `/login?error=send&reason=${encodeURIComponent(error.message)}` : "/login?sent=1");
  }

  return (
    <div className="pr-app">
      <div className="pr-login">
        <div className="pr-login-card">
          <div className="pr-login-mark"><BaconMark size={56} /></div>
          <div className="pr-login-name">BACON</div>
          <div className="pr-login-tag">research radar</div>
          <p className="pr-login-sub">Multi-lens investment research. Convergence builds conviction — never a single indicator.</p>
          {sp.sent && <p className="pr-login-msg">Check your email for a magic sign-in link — open it in this browser.</p>}
          {sp.error === "auth" && <p className="pr-login-msg is-err">Couldn&apos;t verify that link. Open the most recent link in the same browser you requested it from — older links and other browsers won&apos;t match.{sp.reason ? ` (${sp.reason})` : ""}</p>}
          {sp.error && sp.error !== "auth" && <p className="pr-login-msg is-err">Couldn&apos;t send the link{sp.reason ? `: ${sp.reason}` : ""}. If you&apos;ve tried several times, you may be hitting Supabase&apos;s email rate limit — wait a minute and retry.</p>}
          <form action={handleLogin} className="pr-login-form">
            <input name="email" type="email" required placeholder="your@email.com" autoComplete="email" className="pr-login-input" />
            <button type="submit" className="pr-login-btn">Send magic link</button>
          </form>
          <p className="pr-login-note">Verify yourself · Not financial advice</p>
        </div>
      </div>
    </div>
  );
}
