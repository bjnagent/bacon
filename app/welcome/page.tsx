import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MarketingShell } from "@/components/marketing/SiteChrome";
import { ExampleBrief } from "@/components/marketing/ExampleBrief";
import { Faq, type FaqEntry } from "@/components/marketing/Faq";
import { IconArrowRight, IconCheck, IconLayers, IconPhone, IconScale, IconSearch, IconShield, IconMoon, IconTarget } from "@/components/marketing/icons";
import { APP_STORE_URL } from "@/components/marketing/site";
import InstallGuide from "@/components/InstallGuide";
import { LENSES } from "@/lib/lenses";
import { PLANS, PLAN_ORDER, TRIAL_DAYS, annualMonthly, formatPrice } from "@/lib/plans";
import m from "@/components/marketing/Marketing.module.css";
import s from "./welcome.module.css";
import DeletedNotice from "./DeletedNotice";

// The public landing page. Fully static: nothing here depends on who is
// looking, so it is prerendered once and served from the edge. The only
// per-visit bit (the "account deleted" notice) is a client island.

const TITLE = "Bacon — your overnight research desk";
const DESCRIPTION =
  "Wake up to a short, ranked brief of the ideas where independent signals agree — with the reasoning, the condition that would kill each one, and a public record of how past calls aged.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/welcome" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "Bacon", url: "/welcome", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// The eight lenses, each in its channel colour (tokens: --lens-<key>).
const lensVar = (key: string) => `var(--lens-${key.toLowerCase()})`;

const FAQ: FaqEntry[] = [
  {
    q: "Is this financial advice?",
    a: (
      <>
        <p>
          No. Bacon is a research tool. It shows you where independent signals agree, what would confirm an idea and what
          would kill it — and leaves the decision with you. It doesn&apos;t know your finances, goals or appetite for risk,
          it isn&apos;t a broker or a licensed adviser, and like any analysis its output can be wrong.
        </p>
        <p><Link href="/legal/disclaimer">Read the full disclaimer</Link></p>
      </>
    ),
  },
  {
    q: "Where do the numbers come from?",
    a: (
      <>
        <p>
          From data providers, never from the model&apos;s memory. Prices and the day&apos;s movers come from market-data
          providers; rates and inflation from the Federal Reserve&apos;s FRED database; company financials and insider
          buying from SEC filings. Charts are live from TradingView.
        </p>
        <p>
          Figures are shown with their source. If the AI states a number it can&apos;t source, a data check flags it so
          you know to verify it before relying on it.
        </p>
      </>
    ),
  },
  {
    q: "How does it grade itself?",
    a: (
      <p>
        Every call the desk makes is dated and filed. Thirty days later it&apos;s priced against the same money in SPY.
        The house account&apos;s record is public — misses included, in the order the calls were made, with no way to
        reorder by outcome. <Link href="/record">See the track record</Link>.
      </p>
    ),
  },
  {
    q: "What's in the free plan?",
    a: (
      <>
        <ul className={s.faqList}>
          {PLANS.free.highlights.map((h) => <li key={h}>{h}</li>)}
        </ul>
        <p>
          Every new account also starts with {TRIAL_DAYS} days of Pro, no card needed. When the trial ends you simply move
          to Free unless you choose a plan. <Link href="/pricing">Compare plans</Link>.
        </p>
      </>
    ),
  },
  {
    q: "Can I cancel any time?",
    a: (
      <p>
        Yes. Paid plans renew monthly or yearly until you cancel. On the web, cancel from Account → Plan; if you
        subscribed in the iPhone app, cancel in your Apple ID&apos;s subscription settings. You keep your plan until the end
        of the period you&apos;ve paid for.
      </p>
    ),
  },
  {
    q: "What happens to my data?",
    a: (
      <p>
        Your watchlist, themes, settings and chats belong to your account and stay private to it. We don&apos;t sell
        personal data. You can delete your account and its data from inside the app, under Account → Delete account.{" "}
        <Link href="/legal/privacy">Privacy policy</Link>.
      </p>
    ),
  },
];

export default function WelcomePage() {
  return (
    <MarketingShell current="home">
      <Suspense fallback={null}>
        <DeletedNotice />
      </Suspense>

      {/* ---------- Hero ---------- */}
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={`${m.container} ${s.heroGrid}`}>
          <div className={s.heroCopy}>
            <p className={s.pill}>{TRIAL_DAYS} days of Pro on every new account · no card</p>
            <h1 id="hero-title" className={s.h1}>Your overnight research desk.</h1>
            <p className={s.heroLede}>
              Wake up to a short, ranked brief of the ideas where independent signals agree — with the reasoning, the
              condition that would kill each one, and none of the hype.
            </p>
            <div className={s.ctas}>
              <Link href="/login?mode=signup" className="ui-btn ui-btn--primary ui-btn--lg">
                Start free <IconArrowRight />
              </Link>
              <Link href="/record" className="ui-btn ui-btn--lg">See the track record</Link>
            </div>
            <ul className={s.proof}>
              <li><IconCheck /> Never invents a number</li>
              <li><IconCheck /> Sources cited, gaps flagged</li>
              <li><IconCheck /> Grades its own calls in public</li>
            </ul>
          </div>
          <div className={s.heroArt}>
            <ExampleBrief id="example" />
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className={m.section} id="how" aria-labelledby="how-title">
        <div className={m.container}>
          <div className={m.sectionHead}>
            <p className={m.eyebrow}>How it works</p>
            <h2 id="how-title" className={m.h2}>It does the reading while you sleep.</h2>
            <p className={m.lede}>No blank search box and no screener to configure. You open Bacon to see what it found.</p>
          </div>
          <ol className={s.steps}>
            <li className={s.step}>
              <span className={s.stepIcon}><IconMoon /></span>
              <span className={s.stepNum}>Step 1</span>
              <h3>It sweeps overnight</h3>
              <p>
                Bacon reads the day&apos;s movers, sector rotation, the macro backdrop, insider filings and the headlines —
                plus the themes and names you follow — then ranks the few ideas where several signals point the same way.
              </p>
            </li>
            <li className={s.step}>
              <span className={s.stepIcon}><IconLayers /></span>
              <span className={s.stepNum}>Step 2</span>
              <h3>It shows its work across eight lenses</h3>
              <p>
                Open any idea, or any ticker, and see it through eight independent lenses. Conviction comes from agreement
                between them, never from a single indicator.
              </p>
              <ul className={s.lenses} aria-label="The eight lenses">
                {LENSES.map((l) => (
                  <li key={l.key}><span className={s.lensDot} style={{ background: lensVar(l.key) }} aria-hidden="true" />{l.name}</li>
                ))}
              </ul>
            </li>
            <li className={s.step}>
              <span className={s.stepIcon}><IconScale /></span>
              <span className={s.stepNum}>Step 3</span>
              <h3>It grades itself in public</h3>
              <p>
                Every call is dated, then priced against SPY thirty days later. The house record is public, misses
                included — and what it gets wrong feeds back into how it reasons next time.
              </p>
              <Link href="/record" className={s.stepLink}>See the track record <IconArrowRight /></Link>
            </li>
          </ol>
        </div>
      </section>

      {/* ---------- Pillars ---------- */}
      <section className={`${m.section} ${s.band}`} aria-labelledby="why-title">
        <div className={m.container}>
          <div className={m.sectionHead}>
            <p className={m.eyebrow}>Why Bacon</p>
            <h2 id="why-title" className={m.h2}>Built to be checked, not just believed.</h2>
          </div>
          <div className={s.pillars}>
            <div className={s.pillar}>
              <span className={s.pillarIcon}><IconSearch /></span>
              <h3>It finds, you don&apos;t search.</h3>
              <p>
                Wake up to a ranked brief instead of a query box — including the second-order names the market hasn&apos;t
                repriced yet, not just the megacaps everyone already owns.
              </p>
            </div>
            <div className={s.pillar}>
              <span className={s.pillarIcon}><IconTarget /></span>
              <h3>Convergence, not a hot take.</h3>
              <p>
                An idea makes the brief only when independent signals agree. Each one ships with what would confirm it and
                the condition that would kill it, spelled out.
              </p>
            </div>
            <div className={s.pillar}>
              <span className={s.pillarIcon}><IconShield /></span>
              <h3>Honest by design.</h3>
              <p>
                Real data only, with sources. Any figure it can&apos;t source is flagged for you to check. It never invents a
                price — and it publishes how its calls aged.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- The receipt ---------- */}
      <section className={m.section} aria-labelledby="receipt-title">
        <div className={m.container}>
          <div className={s.receipt}>
            <div className={s.receiptCopy}>
              <p className={s.receiptEyebrow}>The track record</p>
              <h2 id="receipt-title" className={m.h2}>An opinion, with the receipt.</h2>
              <p>
                Newsletters market their winners. Bacon&apos;s house account files its calls every morning, grades each one
                against SPY thirty days later, and publishes the lot — in the order they were made.
              </p>
            </div>
            <Link href="/record" className={`ui-btn ui-btn--lg ${s.receiptBtn}`}>
              See every call <IconArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Pricing teaser ---------- */}
      <section className={m.section} aria-labelledby="pricing-title">
        <div className={m.container}>
          <div className={`${m.sectionHead} ${m.center}`}>
            <p className={m.eyebrow}>Pricing</p>
            <h2 id="pricing-title" className={m.h2}>Start free. Upgrade when it earns it.</h2>
            <p className={m.lede}>Every new account gets {TRIAL_DAYS} days of Pro — no card, nothing to cancel.</p>
          </div>
          <div className={s.plans}>
            {PLAN_ORDER.map((id) => {
              const p = PLANS[id];
              return (
                <div key={id} className={`${s.plan} ${id === "pro" ? s.planFeatured : ""}`}>
                  <div className={s.planHead}>
                    <h3>{p.name}</h3>
                    {id === "pro" && <span className="ui-badge ui-badge--accent">Recommended</span>}
                  </div>
                  <p className={s.planTag}>{p.tagline}</p>
                  <p className={s.planPrice}>
                    <span>{formatPrice(p.price.monthly)}</span>
                    {p.price.monthly > 0 && <small>/ month</small>}
                  </p>
                  <p className={s.planNote}>
                    {p.price.monthly > 0 ? `or ${formatPrice(annualMonthly(id))}/month billed yearly` : "Free for as long as you like"}
                  </p>
                  <ul className={s.planList}>
                    {p.highlights.slice(0, 3).map((h) => <li key={h}><IconCheck />{h}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className={s.plansMore}>
            <Link href="/pricing" className={s.stepLink}>Compare every plan <IconArrowRight /></Link>
          </p>
        </div>
      </section>

      {/* ---------- On your phone ---------- */}
      <section className={m.section} aria-labelledby="phone-title">
        <div className={`${m.container} ${s.phone}`}>
          <div className={s.phoneCopy}>
            <span className={s.stepIcon}><IconPhone /></span>
            <h2 id="phone-title" className={s.h3}>Use it on your phone</h2>
            <p className={m.lede}>
              The brief is built for the first five minutes of your morning. Same account on every device.
            </p>
            {APP_STORE_URL && (
              <a href={APP_STORE_URL} className="ui-btn ui-btn--primary ui-btn--lg" rel="noopener">
                <IconPhone /> Get the iPhone app
              </a>
            )}
          </div>
          <details className={s.install}>
            <summary>
              <span>{APP_STORE_URL ? "Or add the web app to your home screen" : "Add Bacon to your home screen"}</span>
              <IconArrowRight />
            </summary>
            <div className={s.installBody}>
              <InstallGuide />
            </div>
          </details>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className={m.section} aria-labelledby="faq-title">
        <div className={m.container}>
          <div className={m.sectionHead}>
            <p className={m.eyebrow}>Questions</p>
            <h2 id="faq-title" className={m.h2}>Fair questions.</h2>
          </div>
          <Faq items={FAQ} />
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className={`${m.section} ${s.final}`} aria-labelledby="final-title">
        <div className={`${m.container} ${s.finalInner}`}>
          <h2 id="final-title" className={m.h2}>See what it finds tonight.</h2>
          <p className={m.lede}>Create a free account. Your first {TRIAL_DAYS} days come with Pro&apos;s features, no card needed.</p>
          <div className={s.ctas}>
            <Link href="/login?mode=signup" className="ui-btn ui-btn--primary ui-btn--lg">Start free <IconArrowRight /></Link>
            <Link href="/pricing" className="ui-btn ui-btn--lg">See pricing</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
