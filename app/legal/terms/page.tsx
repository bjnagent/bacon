// DRAFT FOR COUNSEL REVIEW BEFORE LAUNCH. Written in plain English from how the
// product actually works (lib/plans, lib/entitlements, the billing flows), but
// not reviewed by a lawyer. In particular confirm: the contracting entity,
// governing law, the refund policy, the liability cap, the age floor, and the
// Apple "minimum terms" in section 20. Constants live in
// components/marketing/site.ts.

import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/marketing/LegalDoc";
import { CONTACT_EMAIL, ENTITY_IS_BRAND, GOVERNING_LAW, LEGAL_ENTITY, LEGAL_UPDATED, REFUND_WINDOW_DAYS } from "@/components/marketing/site";
import { PLANS, PLAN_ORDER, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of service · Bacon",
  description: "The terms that apply when you use Bacon, including subscriptions, cancellation, refunds and acceptable use.",
  alternates: { canonical: "/legal/terms" },
  robots: { index: true, follow: true },
};

const planNames = PLAN_ORDER.map((p) => PLANS[p].name).join(", ");
const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "Who we are and what these terms cover",
    body: (
      <>
        <p>
          These terms are an agreement between you and{" "}
          {ENTITY_IS_BRAND ? <>Bacon (&ldquo;we&rdquo;, &ldquo;us&rdquo;)</> : <>{LEGAL_ENTITY} (&ldquo;Bacon&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)</>}. They cover
          the Bacon website, the web app and the iPhone app (together, the &ldquo;service&rdquo;). Our{" "}
          <Link href="/legal/disclaimer">Disclaimer</Link> and <Link href="/legal/privacy">Privacy Policy</Link> form part of them.
        </p>
        <p>
          By creating an account or using the service, you agree to these terms. If you don&apos;t agree, please don&apos;t use
          the service. You must be at least 18 years old, or the age of majority where you live if that is higher.
        </p>
      </>
    ),
  },
  {
    id: "not-advice",
    title: "Bacon is a research tool, not an adviser",
    body: (
      <>
        <p>
          Bacon gathers market data and uses artificial intelligence to produce research: a daily brief of ideas, analyses
          of individual assets, and answers in a chat. It is for information and education.
        </p>
        <ul>
          <li><strong>It is not investment, financial, tax or legal advice</strong>, and nothing in it is a recommendation or an offer to buy, sell or hold any security or other asset.</li>
          <li><strong>It is not personalised.</strong> Bacon doesn&apos;t know your finances, objectives, time horizon or tolerance for risk, and doesn&apos;t take them into account.</li>
          <li><strong>We are not your adviser or broker.</strong> We are not registered or licensed as an investment adviser, financial adviser or broker-dealer, and using Bacon creates no fiduciary, advisory or client relationship.</li>
          <li><strong>Every decision is yours.</strong> You are solely responsible for your investment decisions and their outcome. Consider speaking to a licensed professional before acting.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI output and data can be wrong",
    body: (
      <>
        <p>
          The service relies on AI models from third parties and on data from third-party providers. AI can produce
          statements that sound right and aren&apos;t; data can be delayed, incomplete or wrong. We design against this —
          figures should carry a source, and unsourced figures are flagged in a data check — but those safeguards reduce
          errors, they don&apos;t eliminate them.
        </p>
        <p>
          Track records, hit rates and comparisons with an index are hypothetical, calculated from recorded prices, and
          don&apos;t reflect fees, taxes or real trading. Past results don&apos;t predict future ones. Don&apos;t rely on Bacon as
          the only basis for any decision; check anything that matters against primary sources.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>Give us an email address you control and keep it up to date — sign-in links and important notices go there.</li>
        <li>Keep your password and sign-in links to yourself. You&apos;re responsible for what happens under your account.</li>
        <li>An account is for one person. Please don&apos;t share it.</li>
        <li>Tell us straight away at {mail} if you think someone else has accessed your account.</li>
      </ul>
    ),
  },
  {
    id: "plans",
    title: "Plans, the free trial and allowances",
    body: (
      <>
        <p>
          Bacon has a free plan and paid plans (currently {planNames}). What each includes — features and monthly
          allowances such as deep dives, pressure tests and chat messages — is described on our{" "}
          <Link href="/pricing">pricing page</Link> and in the app.
        </p>
        <ul>
          <li>Allowances reset at the start of each calendar month (UTC). Unused allowance doesn&apos;t carry over.</li>
          <li>
            <strong>Free trial.</strong> Each new account starts with {TRIAL_DAYS} days of Pro features, with a trial-sized
            allowance. No payment details are needed and nothing is charged. When the trial ends the account moves to the
            free plan unless you choose a paid plan. One trial per person.
          </li>
          <li>
            <strong>Fair use.</strong> Allowances are sized for one person doing their own research. We may limit or pause
            activity that looks automated or abusive, or that threatens the service for others.
          </li>
          <li>
            We may change plans, features and allowances. If a change materially reduces what a paid plan you&apos;re on
            includes, it takes effect from your next renewal and we&apos;ll tell you beforehand.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "billing",
    title: "Subscriptions, billing and automatic renewal",
    body: (
      <>
        <ul>
          <li>Paid plans are billed in advance, monthly or yearly, at the price shown when you subscribe, plus any applicable tax.</li>
          <li><strong>Subscriptions renew automatically</strong> at the end of each billing period, for the same period, until you cancel.</li>
          <li>If we change a price, we&apos;ll tell you in advance and the new price applies from your next renewal. You can cancel before then.</li>
          <li>
            <strong>On the web</strong>, payments are processed by Stripe. <strong>In the iPhone app</strong>, purchases are
            made through your Apple ID and are also subject to Apple&apos;s terms; Apple charges your Apple ID account when you
            confirm the purchase.
          </li>
          <li>If a payment fails we may retry it, and may move the account to the free plan if it can&apos;t be collected.</li>
        </ul>
      </>
    ),
  },
  {
    id: "cancel",
    title: "Cancelling",
    body: (
      <>
        <p>You can cancel at any time. How depends on where you subscribed:</p>
        <ul>
          <li><strong>Web:</strong> in the app, go to Account → Plan and manage your subscription.</li>
          <li>
            <strong>App Store:</strong> on your iPhone, open Settings → your name → Subscriptions. To avoid the next charge,
            cancel at least 24 hours before the current period ends.
          </li>
        </ul>
        <p>
          After cancelling you keep your plan until the end of the period you&apos;ve paid for, then move to the free plan.
          Deleting your Bacon account ends a web subscription with it; an App Store subscription must be cancelled with
          Apple, because only Apple can stop Apple&apos;s billing.
        </p>
      </>
    ),
  },
  {
    id: "refunds",
    title: "Refunds",
    body: (
      <ul>
        <li>
          <strong>Web purchases:</strong> if Bacon isn&apos;t for you, email {mail} within {REFUND_WINDOW_DAYS} days of your
          first payment for a plan and we&apos;ll refund that payment in full. Other payments, including renewals, aren&apos;t
          refundable, except where we&apos;ve made a billing error or the law gives you a right to one.
        </li>
        <li>
          <strong>App Store purchases:</strong> Apple handles all refunds for purchases made in the iPhone app, under its own
          policies. We can&apos;t issue them; request one at reportaproblem.apple.com.
        </li>
        <li>Nothing here affects any rights you have under consumer law where you live.</li>
      </ul>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>When you use Bacon, please don&apos;t:</p>
        <ul>
          <li>break the law, or use the service in connection with market manipulation, insider dealing or fraud;</li>
          <li>share your account, or resell, sublicense or commercially republish the service or its output;</li>
          <li>present Bacon&apos;s output to others as professional or personalised investment advice;</li>
          <li>scrape or crawl the service, access it through automated means other than features we provide, or work around plan allowances;</li>
          <li>probe, test or breach our security, or interfere with the service or other people&apos;s use of it;</li>
          <li>reverse engineer the service, except where the law allows it despite this restriction;</li>
          <li>use the chat to create unlawful, harassing or harmful content, or try to extract other users&apos; data.</li>
        </ul>
      </>
    ),
  },
  {
    id: "your-content",
    title: "What you put in",
    body: (
      <p>
        Your watchlist, themes, notes, settings and chat messages stay yours. You give us permission to store and process
        them to run the service for you — including sending the relevant parts to our AI providers to generate your
        research, as described in the <Link href="/legal/privacy">Privacy Policy</Link>. Please don&apos;t put anything in
        that you don&apos;t have the right to share.
      </p>
    ),
  },
  {
    id: "our-content",
    title: "Our service and its output",
    body: (
      <>
        <p>
          The service — its software, design, brand and content — belongs to us or our licensors. Subject to these terms,
          you may use what Bacon produces for you for your own personal research.
        </p>
        <p>
          Market data, charts (including embedded TradingView charts) and other third-party content remain the property of
          their providers and are subject to their terms.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services",
    body: (
      <p>
        Bacon depends on others — data providers, AI providers, Apple, Stripe and our hosting providers. We choose them
        carefully but aren&apos;t responsible for their content, availability or actions. Links to other sites are for
        convenience and aren&apos;t an endorsement.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: (
      <p>
        We work to keep Bacon running and accurate, but we provide it as available. Briefs, alerts and emails depend on
        third parties and can be late, incomplete or missing. We may change, add or remove features, and may suspend the
        service for maintenance or security.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and closing accounts",
    body: (
      <>
        <p>
          You can stop using Bacon at any time and delete your account from inside the app (Account → Delete account).
        </p>
        <p>
          We may suspend or close an account that breaches these terms, is used fraudulently, or where the law requires
          it. Where it&apos;s reasonable to, we&apos;ll tell you first and give you a chance to put things right. If we close an
          account without cause, we&apos;ll refund the unused part of any web subscription.
        </p>
      </>
    ),
  },
  {
    id: "warranties",
    title: "Disclaimer of warranties",
    body: (
      <p>
        To the extent the law allows, the service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties
        of any kind — including that it will be accurate, complete, timely, uninterrupted or fit for a particular purpose,
        or that any idea, call or analysis will turn out to be right.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <>
        <p>To the extent the law allows:</p>
        <ul>
          <li>
            we aren&apos;t liable for any investment or trading losses, lost profits or opportunities, or any indirect,
            incidental or consequential loss, arising from your use of — or reliance on — the service;
          </li>
          <li>
            our total liability for any claim relating to the service is limited to the greater of the amount you paid us in
            the 12 months before the claim and US$100.
          </li>
        </ul>
        <p>
          Nothing in these terms limits liability that can&apos;t legally be limited, such as for fraud, or for death or
          personal injury caused by negligence, or your rights as a consumer.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Responsibility for misuse",
    body: (
      <p>
        If you break these terms or the law in using Bacon, and that leads to a claim against us, you agree to cover our
        reasonable losses and costs from that claim, to the extent the law allows.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. We&apos;ll post the new version here with a new date, and for material changes we&apos;ll
        tell you by email or in the app at least 14 days before they take effect. If you keep using Bacon after that, the
        new terms apply; if you don&apos;t agree, you can cancel and delete your account.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These terms are governed by the laws of {GOVERNING_LAW}, and the courts of {GOVERNING_LAW} have jurisdiction, except
        where the law of the country you live in gives you, as a consumer, the right to bring a claim locally or to rely
        on its mandatory protections. If something goes wrong, please email {mail} first — most things can be sorted out
        quickly.
      </p>
    ),
  },
  {
    id: "apple",
    title: "If you use the iPhone app",
    body: (
      <>
        <p>These additional terms apply to the iPhone app downloaded from the App Store:</p>
        <ul>
          <li>These terms are between you and us, not Apple. We, not Apple, are responsible for the app and its content.</li>
          <li>Apple has no obligation to provide maintenance or support for the app.</li>
          <li>
            If the app fails to meet any applicable warranty, you may notify Apple, and Apple may refund the purchase price
            (if any) paid for the app. To the extent the law allows, Apple has no other warranty obligation for the app.
          </li>
          <li>
            We, not Apple, are responsible for handling any claims relating to the app — including product liability,
            failure to meet legal or regulatory requirements, consumer protection and privacy claims, and any claim that
            the app infringes someone else&apos;s intellectual property.
          </li>
          <li>
            You confirm that you aren&apos;t located in a country subject to a US government embargo or designated as a
            &ldquo;terrorist supporting&rdquo; country, and aren&apos;t on any US government list of prohibited or restricted parties.
          </li>
          <li>You must also comply with any third-party terms that apply to you when using the app.</li>
          <li>Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you.</li>
        </ul>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <p>{LEGAL_ENTITY} · {mail}</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      path="/legal/terms"
      title="Terms of service"
      updated={LEGAL_UPDATED}
      sections={SECTIONS}
      summary={
        <ul>
          <li>Bacon is a research tool. Its output can be wrong, and it isn&apos;t investment advice — every decision is yours.</li>
          <li>New accounts get {TRIAL_DAYS} days of Pro with no card. Paid plans renew automatically until you cancel.</li>
          <li>Cancel any time: Account → Plan on the web, or your Apple ID settings for App Store subscriptions.</li>
          <li>Web refunds within {REFUND_WINDOW_DAYS} days of your first payment for a plan; Apple handles App Store refunds.</li>
          <li>Use it for your own research. Don&apos;t share accounts, scrape, or resell the output.</li>
        </ul>
      }
    />
  );
}
