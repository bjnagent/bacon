import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import BaconMark from "@/components/BaconMark";
import ResetForm from "./ResetForm";
import s from "../login.module.css";

export const metadata: Metadata = {
  title: "Choose a new password · Bacon",
  robots: { index: false, follow: false },
};

// Where a password-reset email lands (via /api/auth/callback or /confirm,
// which have already turned the link into a session). Without that session the
// link was stale, so send them back to request a fresh one.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (!claims?.sub) redirect("/login?error=reset");

  return (
    <main className="center-screen">
      <div className={s.wrap}>
        <Link href="/welcome" className={s.brand} aria-label="Bacon home">
          <BaconMark size={40} />
          <span>Bacon</span>
        </Link>
        <div className={s.head}>
          <h1>Choose a new password</h1>
          <p>You&apos;ll stay signed in on this device.</p>
        </div>
        <ResetForm email={claims.email ?? ""} next={safeNext(sp.next)} />
      </div>
    </main>
  );
}
