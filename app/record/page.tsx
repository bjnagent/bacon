import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/SiteChrome";
import m from "@/components/marketing/Marketing.module.css";
import { loadHouseRecord, type HouseRecord } from "@/lib/houseRecordServer";
import { HouseRecordBody } from "@/components/record/HouseRecordBody";
import { GradingMethod } from "@/components/record/GradingMethod";
import { pct } from "@/components/record/recordModel";
import p from "@/components/record/PublicRecord.module.css";

// The public scorecard. No login, because proof behind a login isn't proof.
//
// Every priced call Bacon's house account has made is listed here — the ones
// that worked and the ones that didn't, in the order they were filed, with no
// way to reorder or filter by outcome. That is the whole point: any newsletter
// can show you its winners. The guarantees (README, "The house record"):
//
//   - No outcome filter. The loader hands over every priced call and the page
//     renders all of them; the stats come from `summarise()` over everything.
//   - Open calls are labelled open (priced, horizon not yet reached).
//   - The SPY comparison — tile and chart — uses the benchmarked subset only.
//   - Live calls never appear: nothing shows until its 30-day pricing, so the
//     page can't front-run members. They are counted, not listed.
//
// Unset HOUSE_USER_ID and the page says the record isn't live. It never falls
// back to another account.

export const dynamic = "force-dynamic";

const TITLE = "Bacon's track record — every call, graded against SPY";
const DESCRIPTION = "Every call Bacon's house account files is priced against real closes and the same money in SPY thirty days later, and published here — misses included. Nothing hand-picked.";

export async function generateMetadata(): Promise<Metadata> {
  // A shared link should carry the live headline, not a promise. Same cached
  // loader as the page, so this costs nothing extra.
  const { summary } = await loadHouseRecord().catch(() => ({ summary: null }) as Pick<HouseRecord, "summary">);
  const live = summary && summary.priced > 0
    ? `${summary.priced} calls graded so far${summary.hitRatePct != null ? `, ${Math.round(summary.hitRatePct)}% moved the way they said` : ""}${summary.alphaPct != null ? `, ${pct(summary.alphaPct)} vs SPY on average` : ""}. `
    : "";
  const description = `${live}${DESCRIPTION}`;
  return {
    title: { absolute: TITLE },
    description,
    alternates: { canonical: "/record" },
    robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: "Bacon", url: "/record", title: TITLE, description },
    twitter: { card: "summary_large_image", title: TITLE, description },
  };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default async function RecordPage() {
  const { configured, summary, calls, truncated } = await loadHouseRecord();

  return (
    <MarketingShell current="record">
      <section className={`${m.container} ${p.hero}`} aria-labelledby="record-title">
        <p className={m.eyebrow}>The house record</p>
        <h1 id="record-title" className={p.h1}>An analyst that has to live with its calls</h1>
        <p className={`${m.lede} ${p.lede}`}>
          Every morning Bacon&apos;s house account files a few specific, dated calls. Thirty days later each one is
          priced against real closing prices and the same money in SPY, and the result lands here — the misses as
          prominently as the hits. Nothing is hand-picked.
        </p>
        <div className={p.ctas}>
          <Link href="/login?mode=signup" className="ui-btn ui-btn--primary ui-btn--lg">Start free</Link>
          <a href="#method" className="ui-btn ui-btn--lg">How it&apos;s graded</a>
        </div>
      </section>

      <section className={`${m.container} ${p.record}`} aria-label="The record">
        <HouseRecordBody configured={configured} summary={summary} calls={calls} truncated={truncated} today={todayIso()} />
      </section>

      <section id="method" className={`${m.section} ${p.method}`} aria-labelledby="method-title">
        <div className={m.container}>
          <div className={m.sectionHead}>
            <p className={m.eyebrow}>Method</p>
            <h2 id="method-title" className={m.h2}>How the record is kept</h2>
            <p className={m.lede}>
              The rules are mechanical, so the record can&apos;t be curated after the fact. This is the same code path
              every member&apos;s own record runs on.
            </p>
          </div>
          <GradingMethod audience="public" columns />
        </div>
      </section>

      <section className={m.container} aria-labelledby="cta-title">
        <div className={p.cta}>
          <h2 id="cta-title" className={p.ctaTitle}>Start your own record</h2>
          <p className={p.ctaBody}>
            Bacon files a call for every idea in your morning brief and every analysis you run, and grades them exactly
            like this. Your first grades land thirty days in.
          </p>
          <div className={p.ctas}>
            <Link href="/login?mode=signup" className="ui-btn ui-btn--primary ui-btn--lg">Create a free account <ArrowRight aria-hidden="true" /></Link>
            <Link href="/pricing" className="ui-btn ui-btn--lg">See pricing</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
