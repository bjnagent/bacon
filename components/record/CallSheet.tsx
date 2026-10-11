"use client";

import type { ReactNode } from "react";
import { ScanSearch } from "lucide-react";
import { Sheet, Button, Ticker, Delta } from "@/components/ui";
import { ResultBadge } from "./CallLine";
import { CROWDING_LABEL, SOURCE_LABEL, actionLabel, callStatus, fmtDate, gradesOn, pct, type RecordCall } from "./recordModel";
import s from "./CallSheet.module.css";

// One call in full: what was said, when, how loud the name was at the time,
// and exactly how it has been graded. Opened from a row on the Record tab.

export function CallSheet({ call, today, onClose, onAnalyze }: {
  call: RecordCall | null;
  today: string;
  onClose: () => void;
  onAnalyze?: (c: RecordCall) => void;
}) {
  const c = call;
  const title = c ? `${c.instrument} · ${actionLabel(c.action)}` : "";
  const st = c ? callStatus(c) : "pending";
  const canAnalyze = !!c && !!onAnalyze && c.source !== "property";

  return (
    <Sheet
      open={!!c}
      onClose={onClose}
      title={title}
      footer={canAnalyze && c ? (
        <Button block variant="secondary" icon={<ScanSearch />} onClick={() => { onAnalyze?.(c); onClose(); }}>
          Analyze {c.instrument} now
        </Button>
      ) : undefined}
    >
      {c && (
        <div className={s.body}>
          <div className={s.hero}>
            <div className={s.heroTop}>
              {c.source === "property" ? <strong>{c.instrument}</strong> : <Ticker>{c.instrument}</Ticker>}
              <ResultBadge c={c} />
            </div>
            {c.actualPct != null ? (
              <>
                <div className={s.big}><Delta pct={c.actualPct} digits={1} /></div>
                <p className={s.heroSub}>
                  {c.benchPct != null
                    ? <>SPY moved {pct(c.benchPct)} over the same window — {relative(c.actualPct - c.benchPct)}.</>
                    : <>No S&amp;P 500 benchmark for this kind of call, so it&apos;s left out of the SPY comparison.</>}
                </p>
                <p className={s.status}>{st === "final" ? `Final — settled ${fmtDate(c.horizonDate)}` : `Open — still re-graded nightly until ${fmtDate(c.horizonDate)}`}</p>
              </>
            ) : (
              <>
                <div className={s.bigText}>{gradesOn(c) > today ? `Open · first grade ${fmtDate(gradesOn(c))}` : "Open · grading soon"}</div>
                <p className={s.heroSub}>
                  Calls are first priced 30 days after they&apos;re filed. Until then this one is open — and it stays on the record whatever happens.
                </p>
              </>
            )}
          </div>

          <dl className={s.facts}>
            <Fact k="Filed">{fmtDate(c.calledAt)}</Fact>
            <Fact k="From">{SOURCE_LABEL[c.source] ?? c.source}</Fact>
            <Fact k="Call">{actionLabel(c.action)}</Fact>
            <Fact k="Conviction">{c.conviction != null ? `${c.conviction} of 5` : "Not stated"}</Fact>
            <Fact k="Target" wide>{c.targetText?.trim() || "None stated"}</Fact>
            <Fact k="Crowding at call time">{c.crowded ? CROWDING_LABEL[c.crowded] ?? c.crowded : "Not measured"}</Fact>
            <Fact k="First grade">{fmtDate(gradesOn(c))}</Fact>
            <Fact k="Horizon">{fmtDate(c.horizonDate)}</Fact>
            {c.actualPct != null && <Fact k="Move since filing"><span className="t-num">{pct(c.actualPct, 2)}</span></Fact>}
            {c.benchPct != null && <Fact k="SPY, same window"><span className="t-num">{pct(c.benchPct, 2)}</span></Fact>}
            {c.actualPct != null && <Fact k="Direction">{c.hit == null ? "No direction stated — not scored" : c.hit ? "Moved the way the call said" : "Moved against the call"}</Fact>}
            {c.targetErrPct != null && <Fact k="Against its target"><span className="t-num">Landed {pct(c.targetErrPct)} vs the base case</span></Fact>}
          </dl>

          <p className={s.note}>
            The move is measured on real closing prices from the last close on or before the filing day to the latest close; SPY is measured over the identical dates. Price movement only — no fees or dividends.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function Fact({ k, children, wide }: { k: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`${s.fact}${wide ? ` ${s.factWide}` : ""}`}>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// A difference of two percentages is in percentage points, and unsigned once
// "ahead"/"behind" carries the direction.
const relative = (diff: number) =>
  Math.abs(diff) < 0.05 ? "level with the market" : `${Math.abs(diff).toFixed(1)} points ${diff > 0 ? "ahead of" : "behind"} it`;
