// DRAFT FOR COUNSEL REVIEW BEFORE LAUNCH. Plain-English description of what
// Bacon's output is and isn't. Confirm in particular the regulatory statements
// in "Not a licensed adviser" for every market we sell into (e.g. the US, UK,
// Singapore and Australia each treat "general information" differently), and
// the "no paid placement" commitment.

import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/marketing/LegalDoc";
import { LEGAL_ENTITY, LEGAL_UPDATED } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Disclaimer · Bacon",
  description: "Bacon is a research tool, not investment advice. What its ideas, calls, data and track record are — and aren't.",
  alternates: { canonical: "/legal/disclaimer" },
  robots: { index: true, follow: true },
};

const SECTIONS: LegalSection[] = [
  {
    id: "research",
    title: "Research, not advice",
    body: (
      <>
        <p>
          Everything Bacon shows you — briefs, ideas, analyses, lens readings, chat answers, alerts and track records — is
          general information for research and education. It is not investment, financial, tax, accounting or legal
          advice, and it isn&apos;t a recommendation, offer or solicitation to buy, sell or hold any security, currency,
          commodity or other asset.
        </p>
        <p>
          Bacon doesn&apos;t know your circumstances — your finances, goals, time horizon or tolerance for risk — and doesn&apos;t
          take them into account. Something reasonable for one person can be wrong for another.
        </p>
      </>
    ),
  },
  {
    id: "not-licensed",
    title: "Not a licensed adviser or broker",
    body: (
      <p>
        {LEGAL_ENTITY} is not registered or licensed as an investment adviser, financial adviser or broker-dealer in any
        jurisdiction. Using Bacon doesn&apos;t make you our client and creates no fiduciary or advisory relationship. We
        don&apos;t execute trades or hold your money. If you need advice, speak to a professional who is licensed where you
        live.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI-generated content can be wrong",
    body: (
      <>
        <p>
          Bacon uses large language models. They can produce statements that are fluent, confident and false. We build
          against that: real figures come from data providers rather than the model&apos;s memory, sources are shown, and any
          figure the AI states without a source is flagged in a data check. Those safeguards reduce mistakes; they don&apos;t
          remove them.
        </p>
        <p>
          Errors can include misattributed or stale data, a misread filing, the wrong company for a symbol, or reasoning
          that doesn&apos;t hold. Check anything that matters against primary sources — filings, the company&apos;s own
          reports, your broker&apos;s quotes — before you act on it.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "Market data",
    body: (
      <p>
        Prices, movers, macro series, filings and headlines come from third parties. They may be delayed — closing prices
        are labelled as such — incomplete or wrong, and they aren&apos;t suitable for decisions that need real-time data.
        Headlines are paraphrased and attributed to their source. Charts are provided by TradingView.
      </p>
    ),
  },
  {
    id: "ideas",
    title: "Ideas, calls, kill conditions and convergence",
    body: (
      <ul>
        <li>An idea or call describes what a set of signals suggests on the day it&apos;s made. It is not a prediction or a promise.</li>
        <li>
          A <strong>kill condition</strong> is a note of what would break the thesis, to help you monitor it. It is not a
          stop-loss, an order or a risk control, and alerts about it can arrive late or not at all.
        </li>
        <li>
          <strong>Convergence</strong> — several independent lenses agreeing — raises or lowers conviction in an idea. It
          doesn&apos;t make an outcome likely, let alone certain.
        </li>
        <li>Horizons (&ldquo;3–6 months&rdquo;) describe when a thesis might play out, not when it will.</li>
      </ul>
    ),
  },
  {
    id: "performance",
    title: "Track records and performance",
    body: (
      <>
        <p>
          Track records in Bacon, including the public house record, are <strong>hypothetical</strong>. They measure how a
          call would have done using recorded prices — for example a notional amount compared with the same amount in an
          index fund tracking SPY over the same period. They don&apos;t reflect actual trades, and leave out fees, taxes,
          spreads, slippage and the effect of acting on the call.
        </p>
        <p>
          Every graded call is included; nothing is hand-picked. But the method that generates and grades calls can change
          over time, and <strong>past performance doesn&apos;t guarantee future results</strong>.
        </p>
      </>
    ),
  },
  {
    id: "risk",
    title: "Investing involves risk",
    body: (
      <p>
        The value of investments can go down as well as up, and you can lose some or all of the money you invest.
        Leveraged, concentrated, illiquid and foreign-currency positions carry extra risk. Only invest what you can afford
        to lose.
      </p>
    ),
  },
  {
    id: "responsibility",
    title: "Your decisions are yours",
    body: (
      <p>
        You are solely responsible for your investment decisions and their results. To the extent the law allows, we
        aren&apos;t liable for any loss arising from using or relying on Bacon — see the limitation of liability in our{" "}
        <Link href="/legal/terms#liability">Terms</Link>.
      </p>
    ),
  },
  {
    id: "independence",
    title: "No paid placement",
    body: (
      <p>
        Bacon doesn&apos;t accept payment from companies or anyone else to include, rank or describe any security or asset.
        What appears in a brief comes from the data and the method, not from a sponsor.
      </p>
    ),
  },
  {
    id: "links",
    title: "Third-party content and links",
    body: (
      <p>
        Bacon summarises and links to third-party sources. We don&apos;t control them and linking isn&apos;t an endorsement of
        their content.
      </p>
    ),
  },
];

export default function DisclaimerPage() {
  return (
    <LegalDoc
      path="/legal/disclaimer"
      title="Disclaimer"
      updated={LEGAL_UPDATED}
      sections={SECTIONS}
      summary={
        <ul>
          <li>Bacon is a research tool. Nothing in it is investment advice or a recommendation to buy or sell.</li>
          <li>It uses AI and third-party data, and can be wrong. Verify anything that matters before acting.</li>
          <li>Track records are hypothetical, and past performance doesn&apos;t predict future results.</li>
          <li>Investing involves risk, including losing money. Your decisions are your own.</li>
        </ul>
      }
    />
  );
}
