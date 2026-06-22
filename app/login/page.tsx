import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BaconMark from "@/components/BaconMark";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect("/");
  const sp = await searchParams;

  async function handleLogin(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    const sb = await createClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback` },
    });
    redirect(error ? "/login?error=1" : "/login?sent=1");
  }

  return (
    <div className="pr-app">
      <div className="pr-login">
        <div className="pr-login-card">
          <div className="pr-login-mark"><BaconMark size={56} /></div>
          <div className="pr-login-name">BACON</div>
          <div className="pr-login-tag">research radar</div>
          <p className="pr-login-sub">Multi-lens investment research. Convergence builds conviction — never a single indicator.</p>
          {sp.sent && <p className="pr-login-msg">Check your email for a magic sign-in link.</p>}
          {sp.error && <p className="pr-login-msg is-err">Couldn&apos;t send the link. Check the address and try again.</p>}
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
