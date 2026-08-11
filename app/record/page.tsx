import Link from "next/link";
import BaconMark from "@/components/BaconMark";
import { loadHouseRecord } from "@/lib/houseRecordServer";

// The public scorecard. No login, because proof behind a login isn't proof.
//
// Every priced call Bacon's house account has made is listed here — the ones
// that worked and the ones that didn't, in the order they were filed, with no
// way to reorder by outcome. That is the whole point: any newsletter can show
// you its winners.

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bacon — the house record",
  description: "Every call Bacon's house account has filed, priced against SPY. Wins and misses.",
};

const pct = (n: number | null, dp = 1) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`);
const tone = (n: number | null) => (n == null ? "" : n >= 0 ? "is-up" : "is-down");

export default async function RecordPage() {
  const { configured, summary, calls, truncated } = await loadHouseRecord();
  const hasCalls = !!summary && summary.priced > 0;

  return (
    <div className="pr-app">
      <div className="pr-welcome">
        <div className="pr-w">
          <header className="pr-w-hero">
            <BaconMark size={72} />
            <h1 className="pr-w-name">THE HOUSE RECORD</h1>
            <div className="pr-w-tag">every call, priced against SPY</div>
            <p className="pr-w-pitch">
              Bacon files dated calls each morning and grades them thirty days later against the
              same money in SPY. This is that record for the house account — <em>including the
              ones that went wrong.</em> Nothing here is hand-picked; the page lists whatever the
              grader returned.
            </p>
          </header>

          {!configured || !summary ? (
            <section className="pr-w-section">
              <p className="pr-w-section-sub">
                The house record isn&apos;t live yet. It appears here once the house account has
                filed calls and the first of them have been priced.
              </p>
            </section>
          ) : !hasCalls ? (
            <section className="pr-w-section">
              <div className="pr-w-section-head">Nothing priced yet</div>
              <p className="pr-w-section-sub">
                {summary.filed > 0
                  ? `${summary.filed} call${summary.filed === 1 ? "" : "s"} filed and waiting. A call is priced thirty days after it's made, so the first results land a month after the first brief.`
                  : "No calls filed yet. The record starts with the first daily sweep."}
              </p>
            </section>
          ) : (
            <>
              <section className="pr-rec-score" aria-label="Scorecard">
                <div className="pr-rec-cell">
                  <span className="pr-rec-lbl">Calls priced</span>
                  <span className="pr-rec-val">{summary.priced}</span>
                  <span className="pr-rec-sub">{summary.settled} settled · {summary.filed} filed</span>
                </div>
                <div className="pr-rec-cell">
                  <span className="pr-rec-lbl">Hit rate</span>
                  <span className="pr-rec-val">{summary.hitRatePct == null ? "—" : `${Math.round(summary.hitRatePct)}%`}</span>
                  <span className="pr-rec-sub">{summary.hits} of {summary.directional} directional</span>
                </div>
                <div className="pr-rec-cell">
                  <span className="pr-rec-lbl">Mean move</span>
                  <span className={`pr-rec-val ${tone(summary.meanReturnPct)}`}>{pct(summary.meanReturnPct)}</span>
                  <span className="pr-rec-sub">across every priced call</span>
                </div>
                <div className="pr-rec-cell">
                  <span className="pr-rec-lbl">vs SPY</span>
                  <span className={`pr-rec-val ${tone(summary.alphaPct)}`}>{pct(summary.alphaPct)}</span>
                  <span className="pr-rec-sub">
                    over the {summary.benchmarked} call{summary.benchmarked === 1 ? "" : "s"} with a benchmark
                  </span>
                </div>
              </section>

              <p className="pr-rec-note">
                Mean move is the average realised change since each call was filed — not a portfolio
                return, and not compounded. The SPY comparison uses only the calls carrying a
                benchmark, so both sides describe the same windows. Excludes fees. Past results are
                not a forecast.
                {summary.firstCallAt ? ` Record runs from ${summary.firstCallAt}.` : ""}
              </p>

              <section className="pr-w-section" aria-label="Every call">
                <div className="pr-w-section-head">Every priced call</div>
                <h2 className="pr-w-section-title">Newest first. No filter.</h2>
                <div className="pr-rec-scroll">
                  <table className="pr-rec-table">
                    <thead>
                      <tr>
                        <th>Filed</th><th>Name</th><th>Call</th><th>Move</th><th>SPY</th><th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calls.map((c, i) => (
                        <tr key={`${c.instrument}-${c.calledAt}-${i}`}>
                          <td className="pr-rec-dim">{c.calledAt}</td>
                          <td className="pr-rec-sym">{c.instrument}</td>
                          <td>
                            {c.action}
                            {c.targetText ? <span className="pr-rec-dim"> → {c.targetText}</span> : null}
                          </td>
                          <td className={tone(c.actualPct)}>{pct(c.actualPct)}</td>
                          <td className="pr-rec-dim">{pct(c.benchPct)}</td>
                          <td>
                            {c.hit == null
                              ? <span className="pr-rec-dim">no direction called</span>
                              : <span className={c.hit ? "is-up" : "is-down"}>{c.hit ? "right way" : "wrong way"}</span>}
                            {!c.settled ? <span className="pr-rec-open">open</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {truncated ? <p className="pr-rec-note">Showing the most recent 500 calls.</p> : null}
              </section>
            </>
          )}

          <div className="pr-w-cta">
            <Link href="/login" className="pr-w-btn">Start your own record →</Link>
          </div>

          <footer className="pr-w-foot">
            <Link href="/welcome">What Bacon is</Link> · Research, not advice · Verify before acting
          </footer>
        </div>
      </div>
    </div>
  );
}
