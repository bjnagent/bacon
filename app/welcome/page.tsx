import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BaconMark from "@/components/BaconMark";
import InstallGuide from "@/components/InstallGuide";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bacon — your overnight opportunity desk" };

// Public splash page (reachable from the bacon logo, no auth required): what
// the app is, how to install it on a phone, and the way back to the cockpit.
export default async function WelcomePage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const cta = user
    ? <Link href="/" className="pr-w-btn">Open your cockpit →</Link>
    : <Link href="/login" className="pr-w-btn">Log in or create an account →</Link>;

  return (
    <div className="pr-app">
      <div className="pr-welcome">
        <div className="pr-w">
          <header className="pr-w-hero">
            <BaconMark size={88} />
            <h1 className="pr-w-name">BACON</h1>
            <div className="pr-w-tag">your overnight opportunity desk</div>
            <p className="pr-w-pitch">
              While you sleep, Bacon sweeps the tape — real movers, sector rotation, fresh
              headlines, the macro backdrop — and pieces the signals together into a ranked
              morning brief of under-the-radar opportunities. <em>You don&apos;t tell it what
              to look for. It shows you.</em>
            </p>
            <div className="pr-w-cta">{cta}</div>
          </header>

          <section className="pr-w-grid" aria-label="What Bacon does">
            <div className="pr-w-card">
              <div className="pr-w-card-kicker">Every morning</div>
              <div className="pr-w-card-title">The daily brief</div>
              <div className="pr-w-card-body">
                A ranked set of opportunities where independent signals converge — including
                the second-order names the tape hasn&apos;t repriced yet.
              </div>
            </div>
            <div className="pr-w-card">
              <div className="pr-w-card-kicker">One click deeper</div>
              <div className="pr-w-card-title">Multi-lens analysis</div>
              <div className="pr-w-card-body">
                Any name gets the full latticework — business, valuation, momentum, trend
                health, factor, macro, sentiment, risk — with live web research and charts.
              </div>
            </div>
            <div className="pr-w-card">
              <div className="pr-w-card-kicker">Honest by design</div>
              <div className="pr-w-card-title">A self-grading record</div>
              <div className="pr-w-card-body">
                Every brief is archived and Bacon grades its own calls later. Real data
                only; it never invents a price.
              </div>
            </div>
          </section>

          <section className="pr-w-section" aria-label="Install the app on your phone">
            <div className="pr-w-section-head">No app store needed</div>
            <h2 className="pr-w-section-title">Put Bacon on your phone</h2>
            <p className="pr-w-section-sub">
              Bacon is an installable web app: add it to your home screen and it opens
              full-screen like a native app, with the same account.
            </p>
            <InstallGuide />
          </section>

          <div className="pr-w-cta">{cta}</div>

          <footer className="pr-w-foot">
            Convergence builds conviction · Verify yourself · Not financial advice
          </footer>
        </div>
      </div>
    </div>
  );
}
