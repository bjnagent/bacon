// DRAFT FOR COUNSEL REVIEW BEFORE LAUNCH. Written from what the code actually
// stores (supabase/schema.sql) and who it actually talks to (the processor
// list below mirrors the integrations in lib/ and app/api/). Confirm before
// launch: the controller entity, the retention periods, the backup window, the
// transfer mechanism, and whether a GDPR/UK representative is needed. If you add
// a table or a provider, update this page in the same change.

import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/marketing/LegalDoc";
import { CONTACT_EMAIL, ENTITY_IS_BRAND, LEGAL_ENTITY, LEGAL_UPDATED } from "@/components/marketing/site";
import s from "@/components/marketing/Legal.module.css";

export const metadata: Metadata = {
  title: "Privacy policy · Bacon",
  description: "What Bacon collects, why, who processes it, how long it's kept, and how to delete your account.",
  alternates: { canonical: "/legal/privacy" },
  robots: { index: true, follow: true },
};

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const PROCESSORS: { name: string; what: string }[] = [
  { name: "Supabase", what: "Database and sign-in. Stores your account and everything you add in the app." },
  { name: "Vercel", what: "Hosting. Serves the website and runs the server code; keeps short-lived request logs." },
  { name: "Anthropic", what: "AI (Claude). Receives the content of research requests and chat messages to generate responses." },
  { name: "Google", what: "AI (Gemini API). Receives the content of some research requests to generate responses." },
  { name: "xAI", what: "AI (Grok API). Receives the content of some research requests to generate responses." },
  { name: "Stripe", what: "Web payments. Handles your card details, billing email and subscription." },
  { name: "Apple", what: "App Store purchases and push notifications. Handles in-app payments; delivers notifications to your device token." },
  { name: "RevenueCat", what: "In-app subscription status. Receives an app user ID and App Store purchase records so your plan works on every device." },
  { name: "Resend", what: "Email delivery. Receives your email address and the content of emails we send you, such as the morning brief and sign-in links." },
];

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <p>
        {ENTITY_IS_BRAND ? <>Bacon (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is</> : <>{LEGAL_ENTITY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) runs Bacon and is</>}{" "}
        responsible for your personal data (the &ldquo;controller&rdquo;). You can reach us about anything in this policy at {mail}.
      </p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <h3>Your account</h3>
        <ul>
          <li>Your email address, and when you signed up and last signed in.</li>
          <li>Your password, if you set one — stored only as a one-way hash by our sign-in provider. We never see it.</li>
        </ul>
        <h3>What you add</h3>
        <ul>
          <li>Your watchlist (the names you track, and any thesis, conviction or notes you add) and your themes.</li>
          <li>Your settings, such as morning email, push alerts, time zone and news preferences.</li>
          <li>If you use the property tracker: the properties you add (a label, market, purchase price and date, and notes).</li>
          <li>Your chat messages and the replies, and the briefs, analyses and calls produced for your account.</li>
        </ul>
        <h3>How you use Bacon</h3>
        <ul>
          <li>In-app events — for example which screens you open and when you run an analysis, with its subject (such as a ticker).</li>
          <li>AI usage records — which feature ran, which model, and its size and cost — so we can apply plan allowances and manage costs.</li>
        </ul>
        <h3>Your device</h3>
        <ul>
          <li>If you allow notifications in the iPhone app, a push token that lets us send alerts to that device.</li>
          <li>Technical data in server logs, such as IP address and browser or device type, kept briefly for security and debugging.</li>
        </ul>
        <h3>Purchases</h3>
        <ul>
          <li>Your plan, its status, billing period and renewal date, and the reference the payment provider gives us.</li>
          <li>We never receive or store your full card number — Stripe and Apple handle payment details.</li>
        </ul>
        <p>
          We don&apos;t ask for your name, your brokerage accounts, the size of your holdings, or identity documents, and we
          don&apos;t use advertising trackers.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <>
        <ul>
          <li>To run the service: build your brief, run analyses, answer chat, send the morning email and alerts you turn on.</li>
          <li>To apply your plan and its allowances, and to process payments.</li>
          <li>To keep Bacon secure and prevent fraud and abuse.</li>
          <li>To support you when you get in touch.</li>
          <li>To understand, in aggregate, which features are used, so we can improve them.</li>
          <li>To meet legal obligations, such as tax records.</li>
        </ul>
        <p>
          <strong>We don&apos;t sell your personal data, use it for advertising, or use it to train AI models.</strong>
        </p>
      </>
    ),
  },
  {
    id: "legal-bases",
    title: "Our legal bases (EEA and UK)",
    body: (
      <ul>
        <li><strong>Contract</strong> — to provide the service you signed up for, including billing.</li>
        <li><strong>Legitimate interests</strong> — security, preventing abuse, and improving the product in ways you&apos;d expect.</li>
        <li><strong>Consent</strong> — push notifications and the morning email, which you can switch off at any time.</li>
        <li><strong>Legal obligation</strong> — for example keeping financial records.</li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "How AI providers are involved",
    body: (
      <p>
        To produce research, we send an AI provider what that request needs: the asset or theme, relevant market data, your
        watchlist or themes where a feature uses them, and — for chat — your messages. We don&apos;t include your email
        address. The providers process this under their API terms to return a response to us.
      </p>
    ),
  },
  {
    id: "processors",
    title: "Who processes data for us",
    body: (
      <>
        <p>
          We use these service providers to run Bacon. Each only receives what its job needs and processes it on our
          behalf.
        </p>
        <dl className={s.processors}>
          {PROCESSORS.map((p) => (
            <div key={p.name} className={s.processor}>
              <dt>{p.name}</dt>
              <dd>{p.what}</dd>
            </div>
          ))}
        </dl>
        <p>
          Market-data providers receive the symbols we look up, never who asked. Charts are embedded from TradingView: when
          you view one, TradingView loads in your browser under its own privacy policy and may set its own cookies.
        </p>
        <p>We may also share data where the law requires it, or with a successor if Bacon is sold or merged — in which case this policy keeps applying to your data.</p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    body: (
      <p>
        Our providers process data in several countries, including the United States and Singapore. Where the law requires
        it, we rely on recognised safeguards, such as standard contractual clauses, for those transfers.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <p>
        We use essential cookies to keep you signed in, and your browser&apos;s local storage for preferences such as light
        or dark mode and to cache data so the app opens quickly. We don&apos;t use advertising or cross-site tracking cookies.
        Embedded TradingView charts may set their own cookies.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li><strong>Your account and what you add:</strong> for as long as your account exists.</li>
        <li>
          <strong>When you delete your account:</strong> your account and its data are removed from our live database
          straight away. Copies in encrypted backups expire on the backup cycle, within 30 days.
        </li>
        <li><strong>Billing records:</strong> for as long as tax and accounting law requires.</li>
        <li><strong>AI cost records:</strong> kept for accounting, with the link to your account removed when you delete it.</li>
        <li><strong>Server logs:</strong> for short periods — typically days to weeks.</li>
        <li><strong>Push tokens:</strong> until you turn notifications off, the token stops working, or you delete your account.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    body: (
      <>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li>see the personal data we hold about you, and get a copy in a portable format;</li>
          <li>correct it if it&apos;s wrong;</li>
          <li>delete it — you can do this yourself, see below;</li>
          <li>object to or restrict some processing;</li>
          <li>withdraw consent, for example by switching off the morning email or push alerts in the app or your device settings;</li>
          <li>complain to your data protection authority.</li>
        </ul>
        <p>
          Email {mail} to use any of these. We&apos;ll answer within 30 days, and may need to confirm the request comes from
          the account&apos;s email address.
        </p>
      </>
    ),
  },
  {
    id: "delete",
    title: "Deleting your account",
    body: (
      <p>
        You can delete your account at any time from inside the app: <strong>Account → Delete account</strong>. That removes
        your account and the data listed above, as described under &ldquo;How long we keep it&rdquo;. If you subscribed through
        the App Store, cancel the subscription in your Apple ID settings too — only Apple can stop Apple&apos;s billing.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Data is encrypted in transit. In our database, row-level security keeps each account&apos;s data readable only by
        that account. Access to production systems is limited to the people who need it to run Bacon. No system is
        perfectly secure; if a breach affects your data, we&apos;ll tell you and the authorities as the law requires.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Bacon is for adults. It isn&apos;t meant for anyone under 18, and we don&apos;t knowingly collect their data.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change this policy we&apos;ll post the new version here with a new date, and tell you by email or in the app
        before material changes take effect. See also our <Link href="/legal/terms">Terms</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      path="/legal/privacy"
      title="Privacy policy"
      updated={LEGAL_UPDATED}
      sections={SECTIONS}
      summary={
        <ul>
          <li>We collect what Bacon needs to work: your email, what you track and ask, your settings, and how you use the app.</li>
          <li>AI providers process research requests and chat messages to generate answers. Your email address isn&apos;t sent to them.</li>
          <li>We don&apos;t sell your data, show you ads, or use your data to train AI models.</li>
          <li>Delete your account any time from inside the app: Account → Delete account.</li>
        </ul>
      }
    />
  );
}
