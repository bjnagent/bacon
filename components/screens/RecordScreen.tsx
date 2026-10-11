"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info, History, RefreshCw, ArrowUpRight } from "lucide-react";
import { useApp } from "@/components/app/AppContext";
import { PageHeader, Section, Button, Callout, EmptyState, SkeletonCard, Sheet } from "@/components/ui";
import { summarise } from "@/lib/houseRecord";
import { StatGrid, StatGridSkeleton, type Stat } from "@/components/record/StatGrid";
import { ValueChart } from "@/components/record/ValueChart";
import { CalibrationCard } from "@/components/record/CalibrationCard";
import { CallList } from "@/components/record/CallList";
import { GradingMethod } from "@/components/record/GradingMethod";
import { BriefHistory, BriefHistorySkeleton, BriefSheet, KillAlerts } from "@/components/record/BriefHistory";
import { useRecordData } from "@/components/record/useRecordData";
import { useBriefHistory } from "@/components/record/useBriefHistory";
import { addDays, buildValueSeries, filterCounts, fmtDay, nextGradeDate, pct, type RecordCall } from "@/components/record/recordModel";
import type { BriefRow } from "@/components/record/briefModel";
import type { ApiError } from "@/lib/client/api";
import s from "@/components/record/RecordScreen.module.css";

// The track record: every call this account's desk has filed, graded against
// real prices and the S&P 500, and what the desk has learned from it. This is
// the product's proof, so it follows the same rules as the public house
// record — every number comes from the unfiltered set of calls, misses and
// open calls included, with the method one tap away.

const NO_BRIEFS: BriefRow[] = [];

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export default function RecordScreen({ active }: { active: boolean }) {
  const app = useApp();
  const data = useRecordData(active);
  const [howOpen, setHowOpen] = useState(false);

  const briefs = data.briefs ?? NO_BRIEFS;
  const briefApi = useBriefHistory(briefs, data.updateBrief, () => { void app.refreshMe(); });

  const calls = useMemo(() => data.record?.calls ?? [], [data.record]);
  const summary = useMemo(() => summarise(calls), [calls]);
  const series = useMemo(() => buildValueSeries(calls), [calls]);
  const counts = useMemo(() => filterCounts(calls), [calls]);
  // "Today" is pinned to the last load, so dates on screen agree with the data.
  const today = data.loadedAt ? isoDay(data.loadedAt) : "";
  const next = today ? nextGradeDate(calls, today) : null;

  const analyze = (c: RecordCall) => app.openAnalyze({ asset: c.instrument, run: false });

  const header = (
    <PageHeader
      title="Track record"
      subtitle={
        <>
          Every call Bacon files is graded against real prices and the S&amp;P 500.{" "}
          <button type="button" className={s.howBtn} onClick={() => setHowOpen(true)} aria-haspopup="dialog">
            <Info aria-hidden="true" />How grading works
          </button>
        </>
      }
    />
  );

  const howSheet = (
    <Sheet open={howOpen} onClose={() => setHowOpen(false)} title="How grading works">
      <div className={s.how}>
        <p className={s.howLead}>Bacon is an analyst that has to live with its calls. Here is exactly how they&apos;re scored.</p>
        <GradingMethod audience="user" />
        <Link className={s.houseLink} href="/record">See Bacon&apos;s own house record <ArrowUpRight aria-hidden="true" /></Link>
      </div>
    </Sheet>
  );

  // ---- loading / error / empty -------------------------------------------
  if (data.loading) {
    return (
      <div className="page" aria-busy="true">
        {header}
        <StatGridSkeleton />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={3} />
        <BriefHistorySkeleton />
        {howSheet}
      </div>
    );
  }

  if (!data.record && data.recordError) {
    const offline = data.recordError.code === "offline";
    return (
      <div className="page">
        {header}
        <Callout tone={offline ? "warn" : "neg"} icon={<RefreshCw />}>
          <div className={s.errBody}>
            <p><strong>{offline ? "You're offline." : "Couldn't load your track record."}</strong> {errDetail(data.recordError)}</p>
            <Button size="sm" variant="secondary" loading={data.busy} onClick={() => void data.reload()}>Try again</Button>
          </div>
        </Callout>
        {howSheet}
      </div>
    );
  }

  const record = data.record;
  const fresh = !!record && calls.length === 0 && briefs.length === 0 && !data.briefsError;
  if (!record || fresh) {
    return (
      <div className="page">
        {header}
        {data.migrationNeeded && <MigrationNote />}
        <div className={s.emptyCard}>
          <EmptyState
            icon={<History />}
            title="Your first calls grade 30 days after they're filed"
            body="Every idea in your brief and every analysis files a dated call. Thirty days on, each one is priced against real closes and the S&P 500, and it shows up here — hits and misses."
            actions={<Link className="ui-btn ui-btn--tonal" href="/record">See the house record <ArrowUpRight aria-hidden="true" /></Link>}
          />
        </div>
        <p className={s.disclaimer}>Research, not investment advice.</p>
        {howSheet}
      </div>
    );
  }

  // ---- the record ----------------------------------------------------------
  const openNotFinal = summary.priced - summary.settled;
  const pending = calls.length - summary.priced;
  const stats: Stat[] = [
    {
      label: "Hit rate",
      value: summary.hitRatePct != null ? `${Math.round(summary.hitRatePct)}%` : "—",
      sub: summary.directional
        ? `${summary.hits} of ${summary.directional} calls moved the way they said`
        : "Shows once a buy or avoid call is graded",
    },
    {
      label: "Average vs S&P 500",
      value: pct(summary.alphaPct),
      tone: summary.alphaPct == null ? undefined : summary.alphaPct >= 0 ? "pos" : "neg",
      sub: summary.benchmarked && summary.alphaPct != null && summary.meanBenchPct != null
        ? `Calls ${pct(summary.alphaPct + summary.meanBenchPct)} vs SPY ${pct(summary.meanBenchPct)} on average, same windows, ${summary.benchmarked} call${summary.benchmarked === 1 ? "" : "s"}`
        : "Needs a graded call with an S&P 500 benchmark",
    },
    {
      label: "Graded calls",
      value: String(summary.priced),
      sub: summary.priced
        ? `Priced on real closes · ${summary.settled} final${openNotFinal ? `, ${openNotFinal} still open` : ""}`
        : next ? `First grade lands ${fmtDay(next)}` : "Calls are first priced 30 days after filing",
    },
    {
      label: "Open calls",
      value: String(counts.open),
      sub: pending
        ? `${pending} awaiting a first grade${next ? ` · next ${fmtDay(next)}` : ""}`
        : counts.open ? "Graded nightly until each horizon" : "Every call on record has settled",
    },
  ];

  return (
    <div className="page">
      {header}

      <KillAlerts briefs={briefs} onOpen={briefApi.open} since={today ? addDays(today, -7) : undefined} />

      <StatGrid stats={stats} label="Your record at a glance" />

      {series.length >= 2 ? (
        <section className={s.card} aria-labelledby="value-title">
          <h2 id="value-title" className={s.cardTitle}>$10K in every call vs SPY</h2>
          <ValueChart points={series} subject="Bacon's calls" />
          <p className={s.cardNote}>
            Gain or loss by filing date. Each graded call with a benchmark adds a hypothetical $10,000 on its filing day, valued at its latest grade; the dashed line puts the same money in SPY over the same windows. Price moves only — no fees or dividends.
          </p>
        </section>
      ) : summary.priced === 0 && calls.length > 0 ? (
        <Callout tone="info" icon={<Info />}>
          <strong>Your first grade lands {next ? fmtDay(next) : "soon"}.</strong> Calls are priced 30 days after they&apos;re filed. Meanwhile, see how the house account&apos;s calls have aged on the <Link className={s.inlineLink} href="/record">public house record</Link>.
        </Callout>
      ) : null}

      <CalibrationCard memo={record.memo} graded={record.graded} minGraded={record.minGraded} />

      <Section title="Calls" sub={record.truncated ? `Your ${calls.length} most recent calls, newest first` : "Newest first. Tap one for the details."}>
        {calls.length ? (
          <CallList calls={calls} today={today} onAnalyze={analyze} />
        ) : (
          <p className={s.quiet}>No calls filed yet. They&apos;re written down from your daily brief and every analysis.</p>
        )}
      </Section>

      <Section title="Brief history" sub="The daily briefs behind the calls, each idea priced as a $10K stake.">
        {data.migrationNeeded && <MigrationNote />}
        {data.briefsError && !data.briefs ? (
          <Callout tone="neg" icon={<RefreshCw />}>
            <div className={s.errBody}>
              <p><strong>Couldn&apos;t load your briefs.</strong> {errDetail(data.briefsError)}</p>
              <Button size="sm" variant="secondary" loading={data.busy} onClick={() => void data.reload()}>Try again</Button>
            </div>
          </Callout>
        ) : briefs.length ? (
          <BriefHistory briefs={briefs} api={briefApi} />
        ) : !data.migrationNeeded ? (
          <p className={s.quiet}>No briefs recorded yet. Each morning&apos;s brief is filed here, so you can price its ideas and ask how they aged.</p>
        ) : null}
      </Section>

      <p className={s.disclaimer}>Research, not investment advice. Past calls don&apos;t predict future ones.</p>

      <BriefSheet briefs={briefs} api={briefApi} />
      {howSheet}
    </div>
  );
}

// The server's own sentence when it tells the reader something (offline,
// signed out); otherwise just the next step, not a restatement of the title.
function errDetail(e: ApiError): string {
  return e.code === "offline" || e.code === "unauthenticated" ? e.message : "Please try again.";
}

function MigrationNote() {
  return (
    <Callout tone="warn" icon={<Info />}>
      The brief history needs one schema update: run the latest <strong>supabase/schema.sql</strong> in the Supabase SQL editor (it&apos;s safe to re-run). Briefs start recording from the next morning.
    </Callout>
  );
}
