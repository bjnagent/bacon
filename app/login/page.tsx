import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import BaconMark from "@/components/BaconMark";
import AuthForm, { type AuthNotice } from "./AuthForm";
import { linkErrorMessage } from "./messages";
import s from "./login.module.css";

export const metadata: Metadata = {
  title: "Sign in · Bacon",
  description: "Sign in to Bacon, or create a free account. New accounts get 7 days of Pro, no card needed.",
  robots: { index: false, follow: true },
};

type SP = { next?: string | string[]; mode?: string; view?: string; error?: string; reason?: string; signedout?: string };

// Dynamic by nature: it reads the session (a signed-in visitor goes straight
// through) and the query string (where to go next, why they're here).
export default async function LoginPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);

  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  if (data?.claims?.sub) redirect(next);

  let notice: AuthNotice | null = null;
  if (sp.error === "auth") notice = { tone: "neg", text: linkErrorMessage(sp.reason) };
  else if (sp.error === "reset") notice = { tone: "neg", text: "That reset link has expired. Enter your email and we'll send a fresh one." };
  else if (sp.signedout === "1") notice = { tone: "neutral", text: "You're signed out." };

  return (
    <main className="center-screen">
      <div className={s.wrap}>
        <Link href="/welcome" className={s.brand} aria-label="Bacon home">
          <BaconMark size={40} />
          <span>Bacon</span>
        </Link>

        <AuthForm
          initialMode={sp.mode === "signup" ? "signup" : "signin"}
          initialView={sp.view === "reset" || sp.error === "reset" ? "reset" : "auth"}
          next={next}
          notice={notice}
        />

        <p className={s.legal}>
          By continuing you agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.
          <br />
          Bacon is a research tool, not investment advice.
        </p>
      </div>
    </main>
  );
}
