import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/SiteChrome";
import { Faq, type FaqEntry } from "@/components/marketing/Faq";
import { IntervalSwitch } from "@/components/marketing/IntervalSwitch";
import { IconArrowRight, IconCheck, IconMinus } from "@/components/marketing/icons";
import { CONTACT_EMAIL, REFUND_WINDOW_DAYS } from "@/components/marketing/site";
import {
  FEATURE_LABEL, METER_LABEL, PLANS, PLAN_ORDER, ROUTE_GATES, TRIAL_DAYS,
  annualMonthly, annualSavingPct, cheapestPlanWith, formatPrice, limitsFor,
  type Feature, type Meter, type PlanId,
} from "@/lib/plans";
import m from "@/components/marketing/Marketing.module.css";
import s from "@/components/marketing/Pricing.module.css";

// Public pricing. Every price, allowance and feature row is read from
// lib/plans — the same catalog the paywall shows and the server enforces — so
// this page cannot drift from what people are actually charged or allowed.
// Static: prerendered once; the monthly/yearly switch is a tiny client island.

const priceLine = PLAN_ORDER.filter((p) => PLANS[p].price.monthly > 0)
  .map((p) => `${PLANS[p].name} ${formatPrice(PLANS[p].price.monthly)}/month`).join(", ");

export const metadata: Metadata = {
  title: "Pricing · Bacon",
  description: `Start free. ${priceLine}, or save with yearly billing. Every new account gets ${TRIAL_DAYS} days of Pro, no card needed.`,
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "Bacon", url: "/pricing", title: "Bacon pricing", description: `Free, then ${priceLine}. ${TRIAL_DAYS} days of Pro on every new account.` },
};

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

const METERS = Object.keys(METER_LABEL) as Meter[];
// Cheapest-plan-first, so the table reads top-down as "what you add by upgrading".
const FEATURES = (Object.keys(FEATURE_LABEL) as Feature[])
  .map((f, i) => ({ f, i, rank: PLAN_ORDER.indexOf(cheapestPlanWith(f)) }))
  .sort((a, b) => a.rank - b.rank || a.i - b.i)
  .map((x) => x.f);

// Which tools draw down the "pressure test" meter, straight from the gate map.
const DEEP_TOOLS = Object.values(ROUTE_GATES)
  .filter((g) => g.meter === "deep" && g.feature)
  .map((g) => FEATURE_LABEL[g.feature as Feature]);

// Plain-English definition of each meter. Typed against Meter, so adding a
// meter to the catalog fails the build here until it has a definition.
const METER_HELP: Record<Meter, string> = {
  analysis: "A full eight-lens analysis of any stock, fund, currency or commodity.",
  deep: `One run of ${listJoin(DEEP_TOOLS)} on an idea.`,
  chat: "A message you send in the research chat.",
  sweep: "Rebuilding your brief on demand, outside the overnight run.",
  update: "A fresh read on a tracked name, a theme or the headlines.",
};

const TRIAL = limitsFor("pro", true);
const trialAllowance = listJoin(METERS.filter((k) => TRIAL[k] > 0).map((k) => `${TRIAL[k]} ${TRIAL[k] === 1 ? METER_LABEL[k].one : METER_LABEL[k].many}`));

const CTA: Record<PlanId, { label: string; primary: boolean }> = {
  free: { label: "Start free", primary: false },
  pro: { label: `Try Pro free for ${TRIAL_DAYS} days`, primary: true },
  desk: { label: "Start free, then upgrade", primary: false },
};

const FAQ: FaqEntry[] = [
  {
    q: `How does the ${TRIAL_DAYS}-day trial work?`,
    a: (
      <>
        <p>
          Every new account starts on Pro for {TRIAL_DAYS} days — no card, nothing to cancel. You get Pro&apos;s features
          with a trial-sized allowance ({trialAllowance}).
        </p>
        <p>When the trial ends you move to Free automatically, unless you choose a plan. You&apos;re never charged without choosing to subscribe.</p>
      </>
    ),
  },
  {
    q: "What counts as a deep dive, a pressure test or a refresh?",
    a: (
      <ul className={s.defs}>
        {METERS.map((k) => (
          <li key={k}><span><strong>{cap(METER_LABEL[k].one)}:</strong> {METER_HELP[k]}</span></li>
        ))}
        <li><span>The briefs built overnight, the house brief and the public track record never count against an allowance.</span></li>
      </ul>
    ),
  },
  {
    q: "When do allowances reset?",
    a: <p>On the first day of each calendar month (UTC). Unused allowance doesn&apos;t roll over. If you reach a limit, that one action pauses until the reset — everything else keeps working — or you can upgrade for a bigger allowance straight away.</p>,
  },
  {
    q: "How does billing work?",
    a: (
      <p>
        Paid plans are billed monthly or yearly, in advance, in US dollars plus any applicable tax. They renew
        automatically at the end of each period until you cancel.
      </p>
    ),
  },
  {
    q: "App Store or web — what's the difference?",
    a: (
      <p>
        Subscribe in the iPhone app and Apple handles billing; you manage it in your Apple ID&apos;s subscription settings.
        Subscribe on the web and our payment processor, Stripe, handles it; you manage it from Account → Plan. Either way
        it&apos;s the same plan on the same account, wherever you sign in. App Store prices are set in your local currency
        by Apple, so they can differ slightly from the US-dollar web price.
      </p>
    ),
  },
  {
    q: "How do I cancel?",
    a: (
      <p>
        Any time, in a couple of taps: Account → Plan on the web, or Settings → your name → Subscriptions on iPhone if you
        subscribed through the App Store. You keep your plan until the end of the period you&apos;ve paid for, then move
        to Free.
      </p>
    ),
  },
  {
    q: "Do you offer refunds?",
    a: (
      <>
        <p>
          <strong>Web (Stripe):</strong> if it isn&apos;t for you, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
          within {REFUND_WINDOW_DAYS} days of your first payment for a plan and we&apos;ll refund it in full. After that,
          payments aren&apos;t refundable except where the law requires — but cancelling stops the next renewal.
        </p>
        <p>
          <strong>App Store:</strong> Apple handles refunds for purchases made in the iPhone app. Request one at
          reportaproblem.apple.com.
        </p>
      </>
    ),
  },
  {
    q: "Is there a fair-use policy?",
    a: (
      <p>
        Allowances are sized for one person doing their own research. Accounts are personal: no sharing logins, automated
        scraping, or reselling Bacon&apos;s output. <Link href="/legal/terms">Read the terms</Link>.
      </p>
    ),
  },
];

function Mark({ on }: { on: boolean }) {
  return on
    ? <span className={s.yes}><IconCheck /><span className="sr-only">Included</span></span>
    : <span className={s.no}><IconMinus /><span className="sr-only">Not included</span></span>;
}

const num = (n: number) => (n > 0 ? n.toLocaleString("en-US") : <Mark on={false} />);

export default function PricingPage() {
  const saving = Math.max(...PLAN_ORDER.map(annualSavingPct));
  return (
    <MarketingShell current="pricing">
      <section className={s.hero} aria-labelledby="pricing-title">
        <div className={`${m.container} ${s.heroInner}`}>
          <p className={m.eyebrow}>Pricing</p>
          <h1 id="pricing-title" className={s.h1}>Start free. Pay when it earns it.</h1>
          <p className={s.lede}>
            Every plan includes the daily house brief and the public, graded track record. Every new account gets {TRIAL_DAYS} days
            of Pro — no card needed.
          </p>
        </div>
      </section>

      <section aria-label="Plans">
        <div className={m.container}>
          <IntervalSwitch savingPct={saving}>
            <div className={s.plans}>
              {PLAN_ORDER.map((id) => {
                const p = PLANS[id];
                const paid = p.price.monthly > 0;
                const cta = CTA[id];
                return (
                  <article key={id} className={`${s.plan} ${cta.primary ? s.featured : ""}`} aria-labelledby={`plan-${id}`}>
                    {cta.primary && <span className={s.ribbon}>Recommended</span>}
                    <h2 id={`plan-${id}`} className={s.planName}>{p.name}</h2>
                    <p className={s.planTag}>{p.tagline}</p>
                    <p className={s.price}>
                      <span className={s.priceNum}>
                        {paid ? (
                          <>
                            <span className={s.onlyMonth}>{formatPrice(p.price.monthly)}</span>
                            <span className={s.onlyYear}>{formatPrice(annualMonthly(id))}</span>
                          </>
                        ) : formatPrice(0)}
                      </span>
                      <span className={s.priceUnit}>/ month</span>
                    </p>
                    <p className={s.priceNote}>
                      {paid ? (
                        <>
                          <span className={s.onlyMonth}>Billed monthly · cancel any time</span>
                          <span className={s.onlyYear}>{formatPrice(p.price.annual)} billed yearly · save {annualSavingPct(id)}%</span>
                        </>
                      ) : "Free for as long as you like"}
                    </p>
                    <Link
                      href="/login?mode=signup"
                      className={`ui-btn ui-btn--lg ui-btn--block ${cta.primary ? "ui-btn--primary" : ""} ${s.planCta}`}
                    >
                      {cta.label}
                    </Link>
                    <ul className={s.feats}>
                      {p.highlights.map((h) => <li key={h}><IconCheck />{h}</li>)}
                    </ul>
                  </article>
                );
              })}
            </div>
          </IntervalSwitch>
          <p className={s.after}>Prices in US dollars, plus tax where it applies. Upgrade, downgrade or cancel any time.</p>

          <div className={s.trial}>
            <div>
              <h2>{TRIAL_DAYS} days of Pro for every new account. No card.</h2>
              <p>
                Your own brief built from your watchlist and themes, Bull vs Bear, the kill-condition watch — with a
                trial-sized allowance. When it ends you drop to Free unless you choose a plan.
              </p>
            </div>
            <Link href="/login?mode=signup" className="ui-btn ui-btn--primary ui-btn--lg">Start free</Link>
          </div>
        </div>
      </section>

      <section className={m.section} aria-labelledby="compare-title">
        <div className={m.container}>
          <div className={m.sectionHead}>
            <h2 id="compare-title" className={m.h2}>Compare plans</h2>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <caption className="sr-only">Everything included in each plan</caption>
              <colgroup>
                <col className={s.colLabel} />
                {PLAN_ORDER.map((id) => <col key={id} />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Feature</span></th>
                  {PLAN_ORDER.map((id) => (
                    <th key={id} scope="col">
                      {PLANS[id].name}
                      <small>{PLANS[id].price.monthly > 0 ? `${formatPrice(PLANS[id].price.monthly)}/mo` : "Free"}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className={s.group}><th colSpan={PLAN_ORDER.length + 1} scope="colgroup">Every month</th></tr>
                {METERS.map((k) => (
                  <tr key={k}>
                    <th scope="row">{cap(METER_LABEL[k].many)}<small>{METER_HELP[k]}</small></th>
                    {PLAN_ORDER.map((id) => <td key={id}>{num(PLANS[id].limits[k])}</td>)}
                  </tr>
                ))}

                <tr className={s.group}><th colSpan={PLAN_ORDER.length + 1} scope="colgroup">Tracking</th></tr>
                <tr>
                  <th scope="row">Tracked names<small>Stocks, funds, currencies and more on your watchlist.</small></th>
                  {PLAN_ORDER.map((id) => <td key={id}>{num(PLANS[id].watchlistMax)}</td>)}
                </tr>
                <tr>
                  <th scope="row">Themes<small>Ideas you want the overnight sweep to hunt for.</small></th>
                  {PLAN_ORDER.map((id) => <td key={id}>{num(PLANS[id].themesMax)}</td>)}
                </tr>

                <tr className={s.group}><th colSpan={PLAN_ORDER.length + 1} scope="colgroup">Features</th></tr>
                {FEATURES.map((f) => (
                  <tr key={f}>
                    <th scope="row">{FEATURE_LABEL[f]}</th>
                    {PLAN_ORDER.map((id) => <td key={id}><Mark on={PLANS[id].features.includes(f)} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={m.section} aria-labelledby="pricing-faq">
        <div className={m.container}>
          <div className={m.sectionHead}>
            <h2 id="pricing-faq" className={m.h2}>Billing questions</h2>
          </div>
          <Faq items={FAQ} />
        </div>
      </section>

      <section className={m.section} aria-labelledby="pricing-final">
        <div className={`${m.container} ${s.final}`}>
          <h2 id="pricing-final" className={m.h2}>Try the desk free for {TRIAL_DAYS} days.</h2>
          <p className={s.lede}>No card. If it doesn&apos;t earn a place in your morning, you&apos;ll simply stay on Free.</p>
          <div className={s.ctas}>
            <Link href="/login?mode=signup" className="ui-btn ui-btn--primary ui-btn--lg">Start free <IconArrowRight /></Link>
            <Link href="/record" className="ui-btn ui-btn--lg">See the track record</Link>
          </div>
          <p className="t-caption">Bacon is a research tool, not investment advice.</p>
        </div>
      </section>
    </MarketingShell>
  );
}
