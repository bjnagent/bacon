import type { ReactNode } from "react";
import { Hourglass, CircleAlert, ClipboardList } from "lucide-react";
import type { HouseSummary, PublicCall } from "@/lib/houseRecord";
import { StatGrid, type Stat } from "./StatGrid";
import { ValueChart } from "./ValueChart";
import { CallHeader, CallLine, callList } from "./CallLine";
import { buildValueSeries, fmtDate, pct } from "./recordModel";
import p from "./PublicRecord.module.css";

// The house record itself, as the public /record page shows it: stats, the
// $10K chart and every graded call. Split from the page (which only loads the
// data) so it renders in tests with fixtures — the guarantees below are tested
// in HouseRecordBody.test.tsx rather than taken on trust.
//
//   - Every priced call is listed; nothing is dropped for its outcome.
//   - Open (unsettled) calls are labelled open.
//   - Live (unpriced) calls never render, even if a caller passes them: they'd
//     let the public page front-run members. They are counted instead.

export interface HouseRecordBodyProps {
  configured: boolean;
  summary: HouseSummary | null;
  calls: PublicCall[];
  truncated: boolean;
  /** YYYY-MM-DD, from the server, so status text doesn't depend on the viewer's clock. */
  today: string;
}

export function HouseRecordBody({ configured, summary, calls, truncated, today }: HouseRecordBodyProps) {
  if (!configured) {
    return (
      <StateCard icon={<Hourglass />} title="The house record isn't live yet">
        It appears here once the house account has filed calls and the first of them have been graded — thirty days
        after its first brief. When it starts, it starts from day one: nothing back-filled, nothing removed.
      </StateCard>
    );
  }
  if (!summary) {
    return (
      <StateCard icon={<CircleAlert />} title="The record couldn't be loaded just now">
        This is on our side, not a gap in the record. Please try again in a few minutes.
      </StateCard>
    );
  }
  if (summary.priced === 0) {
    return (
      <StateCard icon={<ClipboardList />} title="Nothing graded yet">
        {summary.filed > 0
          ? `${summary.filed} call${summary.filed === 1 ? "" : "s"} filed and waiting. A call is priced thirty days after it's made, so the first results land a month after the first brief.`
          : "No calls filed yet. The record starts with the house account's first daily brief."}
      </StateCard>
    );
  }

  const shown = calls.filter((c) => c.actualPct != null);
  const series = buildValueSeries(shown);
  const waiting = summary.filed - summary.priced;

  return (
    <div className={p.stack}>
      <StatGrid label="The house record at a glance" stats={houseStats(summary)} />

      {series.length >= 2 && (
        <div className={p.card}>
          <h2 className={p.cardTitle}>$10K in every call vs SPY</h2>
          <ValueChart points={series} subject="Bacon's calls" />
          <p className={p.note}>
            Gain or loss by filing date. Each graded call with a benchmark adds a hypothetical $10,000 on its filing
            day, valued at its latest grade; the dashed line puts the same money in SPY over the same windows. Price
            moves only — no fees or dividends.
          </p>
        </div>
      )}

      <div className={p.callsHead}>
        <h2 className={p.sectionTitle}>Every graded call</h2>
        <p className={p.sectionSub}>
          Newest first. No filter, no sorting by outcome.
          {summary.firstCallAt ? ` The record runs from ${fmtDate(summary.firstCallAt)}.` : ""}
        </p>
      </div>
      <div className={callList.list}>
        <div className={callList.headRow}><CallHeader /></div>
        <ul aria-label="Every graded call, newest first">
          {shown.map((c, i) => (
            <li key={`${c.instrument}-${c.calledAt}-${i}`} className={callList.item}>
              <div className={callList.rowStatic}><CallLine c={c} today={today} /></div>
            </li>
          ))}
        </ul>
      </div>
      {(truncated || waiting > 0) && (
        <p className={p.note}>
          {truncated ? "Showing the most recent 500 calls. " : ""}
          {waiting > 0
            ? `${waiting} newer call${waiting === 1 ? " is" : "s are"} filed but not graded yet; ${waiting === 1 ? "it appears" : "they appear"} here once priced at 30 days.`
            : ""}
        </p>
      )}
    </div>
  );
}

export function houseStats(s: HouseSummary): Stat[] {
  const runningOpen = s.priced - s.settled;
  const waiting = s.filed - s.priced;
  return [
    {
      label: "Hit rate",
      value: s.hitRatePct != null ? `${Math.round(s.hitRatePct)}%` : "—",
      sub: s.directional ? `${s.hits} of ${s.directional} directional calls moved the way they said` : "No directional call graded yet",
    },
    {
      label: "Average vs S&P 500",
      value: pct(s.alphaPct),
      tone: s.alphaPct == null ? undefined : s.alphaPct >= 0 ? "pos" : "neg",
      sub: s.benchmarked && s.alphaPct != null && s.meanBenchPct != null
        ? `Calls ${pct(s.alphaPct + s.meanBenchPct)} vs SPY ${pct(s.meanBenchPct)} on average, same windows, ${s.benchmarked} call${s.benchmarked === 1 ? "" : "s"}`
        : "No benchmarked call graded yet",
    },
    {
      label: "Graded calls",
      value: String(s.priced),
      sub: `Priced on real closes · ${s.settled} final${runningOpen ? `, ${runningOpen} still open` : ""}`,
    },
    {
      label: "Open calls",
      value: String(runningOpen + waiting),
      sub: waiting
        ? `${runningOpen} graded and running · ${waiting} too new to show`
        : runningOpen ? "Graded nightly until each horizon" : "Every call on record has settled",
    },
  ];
}

function StateCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={p.state}>
      <span className={p.stateIcon} aria-hidden="true">{icon}</span>
      <h2 className={p.stateTitle}>{title}</h2>
      <p className={p.stateBody}>{children}</p>
    </div>
  );
}
