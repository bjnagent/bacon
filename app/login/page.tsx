import { createClient } from "@/lib/supabase/client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect("/");

  async function handleLogin(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    const sb = createClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback` },
    });
    if (error) throw error;
  }

  return (
    <main className="login-root">
      <div className="login-card pr-bg-surface pr-border pr-shadow">
        <div className="bacon-logo">🥓</div>
        <h1 className="pr-title">Bacon</h1>
        <p className="pr-subtitle">Multi-lens investment research.</p>
        <form action={handleLogin} method="post" className="login-form">
          <input name="email" type="email" placeholder="your@email.com" required className="pr-input" autoComplete="email" />
          <button type="submit" className="pr-btn-primary">Send magic link</button>
        </form>
        <p className="pr-disclaimer">Verify yourself · Not financial advice</p>
      </div>
    </main>
  );
}
