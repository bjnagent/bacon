import { ChevronRight } from "lucide-react";
import { Badge, Delta, Ticker } from "@/components/ui/Badge";
import type { PublicCall } from "@/lib/houseRecord";
import { actionLabel, callStatus, fmtDay, gradesOn, pct } from "./recordModel";
import s from "./CallLine.module.css";

// One call, as a row. Server-safe so the public page renders it without
// shipping a client bundle; the Record tab wraps it in a button.
//
// It lays itself out by the width of its LIST (a container query), not the
// viewport: two compact lines in a phone-width column, aligned table columns
// once there is room. The column header comes from <CallHeader/>.

/** The list frame and row classes, for the lists that wrap <CallLine/>. */
export const callList = { list: s.list, item: s.item, rowStatic: s.rowStatic, rowBtn: s.rowBtn, headRow: s.headRow };

/** "Settled Oct 1" · "Open · settles Jan 9" · "Open · grades Nov 5". */
export function statusText(c: PublicCall, today: string): string {
  const { open, rest } = statusParts(c, today);
  return open ? `Open · ${rest}` : rest;
}

function statusParts(c: PublicCall, today: string): { open: boolean; rest: string } {
  const st = callStatus(c);
  if (st === "final") return { open: false, rest: `Settled ${fmtDay(c.horizonDate)}` };
  if (st === "open") return { open: true, rest: `settles ${fmtDay(c.horizonDate)}` };
  const due = gradesOn(c);
  // Past its 30 days but not priced yet: the nightly run hasn't reached it, or
  // the instrument has no price series. Don't print a date that has passed.
  return { open: true, rest: due > today ? `grades ${fmtDay(due)}` : "grading soon" };
}

export function ResultBadge({ c }: { c: PublicCall }) {
  if (c.actualPct == null) return null;
  if (c.hit === true) return <Badge tone="pos" title="Moved the way the call said">Hit</Badge>;
  if (c.hit === false) return <Badge tone="neg" title="Moved against the call">Miss</Badge>;
  return <span className={s.noDir} title="A watch or hold call states no direction, so it isn't scored">No direction</span>;
}

export function CallLine({ c, today, chevron }: { c: PublicCall; today: string; chevron?: boolean }) {
  const graded = c.actualPct != null;
  const status = statusParts(c, today);
  const isProperty = c.source === "property";
  return (
    <span className={`${s.line}${chevron ? ` ${s.withChev}` : ""}`}>
      <span className={s.call}>
        <span className={s.inst}>
          {isProperty ? <span className={s.name}>{c.instrument}</span> : <Ticker>{c.instrument}</Ticker>}
          <Badge>{actionLabel(c.action)}</Badge>
        </span>
        <span className={s.result}><ResultBadge c={c} /></span>
      </span>
      <span className={s.meta}>
        <span className={s.filed}><span className={s.pfx}>Filed </span>{fmtDay(c.calledAt)}</span>
        <span className={s.dot} aria-hidden="true"> · </span>
        <span className={s.status}>
          {/* An ungraded call already wears an "Open" tag on the right when compact. */}
          {status.open && <span className={graded ? undefined : s.pendingPfx}>Open · </span>}
          {status.rest}
        </span>
      </span>
      <span className={s.move}>
        {graded ? <Delta pct={c.actualPct} digits={1} /> : <><span className={s.openTag}>Open</span><span className={s.wideOnly}>—</span></>}
      </span>
      <span className={`${s.spy} t-num`}>
        {graded && c.benchPct != null ? <><span className={s.pfx}>SPY </span>{pct(c.benchPct)}</> : <span className={s.wideOnly}>—</span>}
      </span>
      {chevron && <ChevronRight className={s.chev} aria-hidden="true" />}
    </span>
  );
}

/** Column labels for the wide layout; hidden (but still read) when compact. */
export function CallHeader({ chevron }: { chevron?: boolean }) {
  return (
    <div className={`${s.line} ${s.header}${chevron ? ` ${s.withChev}` : ""}`} aria-hidden="true">
      <span className={s.call}><span className={s.inst}>Call</span><span className={s.result}>Result</span></span>
      <span className={s.meta}><span className={s.filed}>Filed</span><span className={s.status}>Status</span></span>
      <span className={s.move}>Move</span>
      <span className={s.spy}>SPY</span>
      {chevron && <span className={s.chev} />}
    </div>
  );
}
