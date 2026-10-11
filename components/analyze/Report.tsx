"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AlertTriangle, ChevronDown, CircleCheck, LineChart, ListChecks, SearchCheck } from "lucide-react";
import { Badge, Callout, Card, List, Row, Skeleton } from "@/components/ui";
import { LENSES, type Lens, type LensKey, type StanceKey } from "@/lib/lenses";
import { toPoints, type Briefing, type LensSection } from "@/lib/parsers";
import { auditBriefingText } from "@/lib/verify";
import { leanOf, type AnalysisMeta } from "@/lib/analysisStore";
import ConvictionRadar from "./ConvictionRadar";
import TradingViewChart from "./TradingViewChart";
import { CALL_TONE, GAP_COPY, LEAN_UI, STANCE_UI, lensVar, verdictParts } from "./model";
import { DESKTOP, useMedia } from "./useMedia";
import s from "./Report.module.css";

type HueStyle = CSSProperties & { "--hue"?: string };

/** Stances so far. While streaming, a lens that hasn't landed is absent (not "mixed"). */
export function stancesSoFar(b: Briefing | null, done: boolean): Partial<Record<LensKey, StanceKey>> {
  const out: Partial<Record<LensKey, StanceKey>> = {};
  for (const l of LENSES) {
    const st = b?.lenses[l.key]?.stance;
    if (st) out[l.key] = st;
    else if (done) out[l.key] = "limited-data";
  }
  return out;
}

// ---------------------------------------------------------------- verdict

function Conviction({ n, tone }: { n: number; tone: string }) {
  return (
    <span className={s.pips} data-tone={tone} role="img" aria-label={`Conviction ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? s.pipOn : s.pip} />)}
      <span className={s.pipLabel} aria-hidden="true">Conviction {n}/5</span>
    </span>
  );
}

export function VerdictCard({ briefing, done }: { briefing: Briefing; done: boolean }) {
  const stances = useMemo(() => stancesSoFar(briefing, done), [briefing, done]);
  const lean = LEAN_UI[leanOf(stances)];
  const v = useMemo(() => verdictParts(briefing.VERDICT), [briefing.VERDICT]);
  const counts = useMemo(() => {
    const c: Record<StanceKey, number> = { constructive: 0, mixed: 0, cautious: 0, "limited-data": 0 };
    for (const st of Object.values(stances)) if (st) c[st]++;
    return c;
  }, [stances]);
  const landed = Object.keys(stances).length;
  const callTone = v.call ? CALL_TONE[v.call] : "neutral";

  return (
    <Card pad="lg" className={s.verdict}>
      <div className={s.verdictTop}>
        <div className={s.callBlock}>
          <div className="t-eyebrow">The call</div>
          {v.call ? (
            <div className={s.callRow}>
              <span className={s.call} data-tone={callTone}>{v.call}</span>
              {v.conviction != null && <Conviction n={v.conviction} tone={callTone} />}
            </div>
          ) : v.headline ? (
            <div className={s.callText}>{v.headline}</div>
          ) : done ? (
            <div className={s.callText}>No call returned</div>
          ) : (
            <div className={s.callPending}><Skeleton height={34} width={132} /><span className="t-caption">Weighing the lenses…</span></div>
          )}
        </div>
        <div className={s.leanBlock}>
          <div className="t-eyebrow">How the lenses lean</div>
          {landed ? <Badge tone={lean.tone}>{lean.label}</Badge> : <Skeleton height={22} width={120} />}
        </div>
      </div>

      {briefing.SUMMARY && <p className={s.summary}>{briefing.SUMMARY}</p>}

      <div className={s.verdictGrid}>
        <figure className={s.gauge}>
          <ConvictionRadar stances={stances} />
          <figcaption className={s.legend}>
            {(Object.keys(counts) as StanceKey[]).filter((k) => counts[k]).map((k) => (
              <span key={k} className={s.legendItem}>
                <span className={s.legendDot} style={{ background: STANCE_UI[k].color }} />
                {counts[k]} {STANCE_UI[k].label.toLowerCase()}
              </span>
            ))}
            {!done && landed < LENSES.length && <span className={s.legendItem}>{LENSES.length - landed} still reading</span>}
          </figcaption>
        </figure>

        <div className={s.verdictBody}>
          {v.details.length > 0 && (
            <dl className={s.details}>
              {v.details.map((d, i) => (
                <div key={i} className={s.detail}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {v.notes.map((n, i) => <p key={i} className="t-callout">{n}</p>)}
          {briefing.BOTTOMLINE ? (
            <div className={s.bottomline}>
              <div className="t-eyebrow">Bottom line</div>
              <p>{briefing.BOTTOMLINE}</p>
            </div>
          ) : !done ? <Skeleton lines={3} /> : null}
        </div>
      </div>

      <p className="t-caption">The lean is how the eight lenses vote. The call is the desk&apos;s verdict after weighing them — the gauge shows convergence, not a score.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- honesty callouts

export function DataCallouts({ meta, briefing, done }: { meta: AnalysisMeta | null; briefing: Briefing | null; done: boolean }) {
  // The figure audit runs once the briefing is complete — mid-stream it would
  // re-scan the whole text every frame to report numbers that are still moving.
  const audit = useMemo(() => {
    if (!done || !briefing) return null;
    return auditBriefingText({ summary: briefing.SUMMARY, bottomline: briefing.BOTTOMLINE, lensBodies: LENSES.map((l) => briefing.lenses[l.key]?.body || "") });
  }, [briefing, done]);
  const gaps = meta?.gaps ?? [];
  if (!gaps.length && !(audit && audit.total > 0)) return null;

  return (
    <div className="stack-sm">
      {gaps.length > 0 && (
        <Callout tone="warn" icon={<AlertTriangle />}>
          <strong>Some live data was unavailable for this run.</strong>
          <ul className={s.gapList}>{gaps.map((g) => <li key={g}>{GAP_COPY[g](meta?.query || meta?.symbol || "")}</li>)}</ul>
          The affected lenses lean on web search instead of our data feeds — confirm any figure before relying on it.
        </Callout>
      )}
      {audit && audit.total > 0 && (audit.flagged.length > 0 ? (
        <Callout tone="warn" icon={<ListChecks />}>
          <strong>Data check: {audit.flagged.length} figure{audit.flagged.length === 1 ? "" : "s"} to verify.</strong>{" "}
          {audit.total} hard figure{audit.total === 1 ? "" : "s"} · {audit.cited} sourced · {audit.estimates} labelled estimate{audit.estimates === 1 ? "" : "s"}.
          These are stated as fact without a source nearby — confirm them before relying on them.
          <details className={s.flags}>
            <summary>Show the figures</summary>
            <ul>
              {audit.flagged.slice(0, 8).map((f, i) => <li key={i}><strong>{f.figure}</strong> — {f.snippet}</li>)}
              {audit.flagged.length > 8 && <li className="t-3">and {audit.flagged.length - 8} more</li>}
            </ul>
          </details>
        </Callout>
      ) : (
        <Callout icon={<CircleCheck />}>
          <strong>Data check passed.</strong> {audit.total} hard figure{audit.total === 1 ? "" : "s"}: {audit.cited} sourced, {audit.estimates} labelled estimate{audit.estimates === 1 ? "" : "s"}. Still verify what matters to you.
        </Callout>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- lenses

function LensCard({ lens, section, pending, collapsible }: { lens: Lens; section?: LensSection; pending: boolean; collapsible: boolean }) {
  const [open, setOpen] = useState(false);
  const st = section ? STANCE_UI[section.stance] : null;
  const points = section ? toPoints(section.body) : [];
  const expanded = !collapsible || open;
  const style: HueStyle = { "--hue": lensVar(lens.key) };

  const head = (
    <>
      <span className={s.lensTitle}>
        <span className={s.lensName}>{lens.name}</span>
        <span className={s.lensBlurb}>{lens.blurb}</span>
      </span>
      {st ? <Badge tone={st.tone}>{st.label}</Badge> : pending ? <Badge>Reading…</Badge> : <Badge>Limited data</Badge>}
      {collapsible && section && <ChevronDown className={s.lensChev} data-open={open || undefined} aria-hidden="true" />}
    </>
  );

  return (
    <article className={s.lens} style={style} data-lens={lens.key}>
      {collapsible && section ? (
        <button type="button" className={s.lensHead} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{head}</button>
      ) : (
        <div className={s.lensHead}>{head}</div>
      )}
      {pending ? (
        <Skeleton lines={2} />
      ) : section ? (
        <div className={s.lensBody}>
          {points.length > 1 ? (
            <ul className={s.points}>{points.map((p, i) => <li key={i} className={!expanded && i > 0 ? s.hidden : undefined}>{p}</li>)}</ul>
          ) : (
            <p className={expanded ? undefined : "t-clamp-2"}>{points[0] ?? section.body}</p>
          )}
          {section.verify && expanded && (
            <div className={s.verify}><SearchCheck aria-hidden="true" /><span><strong>Verify:</strong> {section.verify}</span></div>
          )}
        </div>
      ) : (
        <p className="t-callout">No read came back for this lens.</p>
      )}
    </article>
  );
}

export function LensGrid({ briefing, streaming }: { briefing: Briefing | null; streaming: boolean }) {
  const desktop = useMedia(DESKTOP);
  return (
    <div className={`grid-2 ${s.lenses}`} aria-live="polite" aria-busy={streaming}>
      {LENSES.map((l) => {
        const section = briefing?.lenses[l.key];
        return <LensCard key={l.key} lens={l} section={section} pending={streaming && !section} collapsible={!desktop} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------- chart

/** Collapsed behind a row on phones: the widget is heavy and most reads don't need it. */
export function ChartPanel({ symbol }: { symbol: string }) {
  const desktop = useMedia(DESKTOP);
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? desktop;
  return (
    <div className="stack-sm">
      <List>
        <Row
          icon={<LineChart />}
          title={shown ? "Hide chart" : "Show chart"}
          sub="Live prices via TradingView"
          trailing={<ChevronDown className={s.rowChev} data-open={shown || undefined} aria-hidden="true" />}
          onClick={() => setOpen(!shown)}
        />
      </List>
      {shown && <TradingViewChart symbol={symbol} />}
    </div>
  );
}

// ---------------------------------------------------------------- loading

export function WorkingCard({ symbol }: { symbol: string }) {
  return (
    <Card pad="lg" className={s.working} aria-live="polite">
      <div className={s.workingHead}>
        <span className="ui-spinner" aria-hidden="true" />
        <div>
          <div className="t-headline">Reading {symbol} through eight lenses</div>
          <div className="t-caption">Live web search and market data · usually 20–40 seconds</div>
        </div>
      </div>
      <ul className={s.workingLenses}>
        {LENSES.map((l, i) => (
          <li key={l.key} style={{ "--hue": lensVar(l.key), animationDelay: `${i * 140}ms` } as HueStyle}>{l.name}</li>
        ))}
      </ul>
    </Card>
  );
}

export function ReportSkeleton() {
  return (
    <div className="stack" aria-hidden="true">
      <Card pad="lg">
        <Skeleton height={14} width={80} />
        <Skeleton height={34} width={150} style={{ marginTop: 10 }} />
        <Skeleton lines={3} style={{ marginTop: 16 }} />
      </Card>
      <div className="grid-2">
        {[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton height={16} width="45%" /><Skeleton lines={2} style={{ marginTop: 10 }} /></Card>)}
      </div>
    </div>
  );
}

/** A response that didn't parse as a briefing: shown as written, never dropped. */
export function RawFallback({ text }: { text: string }) {
  return (
    <div className="stack-sm">
      <Callout tone="warn" icon={<AlertTriangle />}>This answer didn&apos;t come back in the usual eight-lens format, so it&apos;s shown as written.</Callout>
      <Card pad="lg"><div className={s.raw}>{text}</div></Card>
    </div>
  );
}
