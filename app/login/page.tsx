import Link from "next/link";
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

  async function originFromHeaders() {
    "use server";
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    return process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "");
  }

  async function signIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    if (!email || !password) redirect("/login?error=signin&reason=Enter%20your%20email%20and%20password");
    const sb = await createClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) redirect(`/login?error=signin&reason=${encodeURIComponent(error.message)}`);
    redirect("/");
  }

  async function signUp(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    if (!email || password.length < 8) redirect("/login?error=signup&reason=Use%20a%20password%20of%20at%20least%208%20characters");
    const sb = await createClient();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${await originFromHeaders()}/api/auth/callback` },
    });
    if (error) redirect(`/login?error=signup&reason=${encodeURIComponent(error.message)}`);
    if (data.session) redirect("/");        // email confirmation disabled → signed straight in
    redirect("/login?sent=confirm");        // confirmation email sent
  }

  async function magicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    if (!email) redirect("/login?error=send&reason=Enter%20your%20email");
    const sb = await createClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${await originFromHeaders()}/api/auth/callback` },
    });
    redirect(error ? `/login?error=send&reason=${encodeURIComponent(error.message)}` : "/login?sent=1");
  }

  let msg: { cls: string; text: string } | null = null;
  if (sp.sent === "1") msg = { cls: "", text: "Check your email for a magic sign-in link — open it in this browser." };
  else if (sp.sent === "confirm") msg = { cls: "", text: "Account created. If email confirmation is on in Supabase, confirm via the email, then sign in — otherwise just sign in now." };
  else if (sp.error === "signin") msg = { cls: "is-err", text: `Couldn't sign in${sp.reason ? `: ${sp.reason}` : ""}.` };
  else if (sp.error === "signup") msg = { cls: "is-err", text: `Couldn't create the account${sp.reason ? `: ${sp.reason}` : ""}.` };
  else if (sp.error === "auth") msg = { cls: "is-err", text: `Couldn't verify that link${sp.reason ? `: ${sp.reason}` : ""}. Open the most recent link in the same browser.` };
  else if (sp.error) msg = { cls: "is-err", text: `Couldn't send the link${sp.reason ? `: ${sp.reason}` : ""}.` };

  return (
    <div className="pr-app">
      <div className="pr-login">
        <div className="pr-login-card">
          <div className="pr-login-mark"><BaconMark size={56} /></div>
          <div className="pr-login-name">BACON</div>
          <div className="pr-login-tag">research radar</div>
          <p className="pr-login-sub">Multi-lens investment research. Convergence builds conviction — never a single indicator.</p>
          {msg && <p className={`pr-login-msg ${msg.cls}`}>{msg.text}</p>}
          <form className="pr-login-form">
            <input name="email" type="email" required placeholder="your@email.com" autoComplete="email" className="pr-login-input" />
            <input name="password" type="password" minLength={6} placeholder="password (6+ characters)" autoComplete="current-password" className="pr-login-input" />
            <button type="submit" formAction={signIn} className="pr-login-btn">Sign in</button>
            <button type="submit" formAction={signUp} className="pr-login-btn pr-login-btn-alt">Create account</button>
            <button type="submit" formAction={magicLink} className="pr-login-link">Email me a magic link instead</button>
          </form>
          <Link href="/welcome" className="pr-login-link">New here? What Bacon is &amp; how to install it →</Link>
          <p className="pr-login-note">Verify yourself · Not financial advice</p>
        </div>
      </div>
    </div>
  );
}
