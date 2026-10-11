"use client";

import { ShieldAlert, Microscope, LineChart, CalendarDays } from "lucide-react";
import { Badge, Button, Callout, List, Row, Sheet, Ticker, Skeleton } from "@/components/ui";
import { VERDICT, activeKills, ideaKey, isPriced, type BriefRow } from "./briefModel";
import { fmtDate, fmtWeekday, pct, signedUsd, usd, usd0 } from "./recordModel";
import type { BriefHistoryApi } from "./useBriefHistory";
import s from "./BriefHistory.module.css";

// The daily briefs the calls came from: each idea priced as a $10K stake from
// its flag day (live, real closes), the "how did it age?" review, and any kill
// condition the nightly watcher found tripped.

/**
 * Kill conditions that have triggered — shown at the top of the screen, not
 * buried in a row. Only recent ones: the nightly watcher re-checks (and clears)
 * the LATEST brief's alert, so an alert on an older brief is history, not news.
 * Every alert still flags its row in the brief history and opens in its sheet.
 */
export function KillAlerts({ briefs, onOpen, since }: { briefs: BriefRow[]; onOpen: (id: string) => void; since?: string }) {
  const kills = activeKills(briefs).filter((k) => !since || (k.at ?? k.briefDate).slice(0, 10) >= since);
  if (!kills.length) return null;
  return (
    <div className={s.kills} role="region" aria-label="Kill conditions hit">
      {kills.map((k, i) => (
        <Callout key={`${k.briefId}-${i}`} tone="neg" icon={<ShieldAlert />}>
          <div className={s.killBody}>
            <p><strong>Kill condition hit on {ideaKey(k.item)}</strong>{k.item.why ? ` — ${k.item.why}` : ""}</p>
            <p className={s.killMeta}>
              From the {fmtDate(k.briefDate)} brief{k.at ? ` · checked ${fmtDate(k.at)}` : ""}. Re-check before relying on this idea.
            </p>
            <button type="button" className={s.killLink} onClick={() => onOpen(k.briefId)}>Open the brief</button>
          </div>
        </Callout>
      ))}
    </div>
  );
}

export function BriefHistory({ briefs, api }: { briefs: BriefRow[]; api: BriefHistoryApi }) {
  const { score } = api;
  return (
    <div className={s.wrap}>
      {(score.pricedDays > 0 || score.graded > 0) && (
        <div className={s.score} aria-label="Brief scoreboard">
          {score.pricedDays > 0 && (
            <div className={s.scoreCell}>
              <span className={s.scoreLabel}>{usd0(score.invested)} staked across {score.pricedDays} priced brief{score.pricedDays === 1 ? "" : "s"}</span>
              <span className={`${s.scoreValue} t-num`}>{usd0(score.value)}</span>
              <span className={`${s.scoreSub} t-num`}><span className={score.roiPct >= 0 ? "t-pos" : "t-neg"}>{pct(score.roiPct, 2)}</span> on the stake</span>
            </div>
          )}
          {score.alphaPct != null && (
            <div className={s.scoreCell}>
              <span className={s.scoreLabel}>vs SPY on the same days</span>
              <span className={`${s.scoreValue} t-num ${score.alphaPct >= 0 ? "t-pos" : "t-neg"}`}>{pct(score.alphaPct, 2)}</span>
              <span className={s.scoreSub}>only days with a benchmark</span>
            </div>
          )}
          {score.hitRatePct != null && (
            <div className={s.scoreCell}>
              <span className={s.scoreLabel}>Reviewed ideas that played out</span>
              <span className={`${s.scoreValue} t-num`}>{Math.round(score.hitRatePct)}%</span>
              <span className={s.scoreSub}>{score.wins} of {score.graded} reviewed</span>
            </div>
          )}
        </div>
      )}

      <List>
        {briefs.map((b) => {
          const t = api.roiFor(b.id)?.totals ?? (b.roi && b.roi.invested ? b.roi : null);
          const verdicts = b.items.filter((i) => i.verdict);
          const played = verdicts.filter((i) => i.verdict === "played-out").length;
          const kill = !!b.kill_alert?.items?.length;
          const sub = [
            `${b.items.length} idea${b.items.length === 1 ? "" : "s"}`,
            verdicts.length ? `${played} of ${verdicts.length} played out` : b.reviewed_at ? "reviewed" : null,
            kill ? "kill condition hit" : null,
          ].filter(Boolean).join(" · ");
          return (
            <Row
              key={b.id}
              icon={kill ? <ShieldAlert /> : <CalendarDays />}
              iconBg={kill ? "var(--neg)" : undefined}
              title={fmtWeekday(b.brief_date)}
              sub={sub}
              value={t && t.invested ? <span className={`t-num ${t.roiPct >= 0 ? "t-pos" : "t-neg"}`}>{pct(t.roiPct, 1)}</span> : undefined}
              chevron
              onClick={() => api.open(b.id)}
            />
          );
        })}
      </List>
    </div>
  );
}

export function BriefSheet({ briefs, api }: { briefs: BriefRow[]; api: BriefHistoryApi }) {
  const b = api.openId ? briefs.find((x) => x.id === api.openId) ?? null : null;
  const priced = b ? api.roiFor(b.id) : undefined;
  const results = priced?.results ?? [];
  const isPricing = !!b && api.pricing === b.id;
  const isReviewing = !!b && api.reviewing === b.id;
  const err = b ? api.priceError[b.id] : undefined;
  const totals = priced?.totals ?? null;
  const nothingPriced = !!priced && !isPricing && (priced.unavailable || (!totals && !results.some(isPriced)));

  return (
    <Sheet
      open={!!b}
      onClose={api.close}
      title={b ? `Brief · ${fmtWeekday(b.brief_date)}` : ""}
      variant="wide"
      footer={b ? (
        <div className={s.actions}>
          <Button variant="tonal" icon={<Microscope />} loading={isReviewing} onClick={() => api.review(b.id)}>
            {isReviewing ? "Checking what happened…" : b.reviewed_at ? "Review again" : "How did it age?"}
          </Button>
          <Button icon={<LineChart />} loading={isPricing} disabled={!!api.pricing && !isPricing} onClick={() => api.price(b.id)}>
            {isPricing ? "Pricing…" : priced ? "Re-price" : "Price $10K"}
          </Button>
        </div>
      ) : undefined}
    >
      {b && (
        <div className={s.sheet}>
          {b.kill_alert?.items?.length ? (
            <Callout tone="neg" icon={<ShieldAlert />}>
              <div className={s.killBody}>
                {b.kill_alert.items.map((k, n) => (
                  <p key={n}><strong>Kill condition hit on {ideaKey(k)}</strong>{k.why ? ` — ${k.why}` : ""}</p>
                ))}
                <p className={s.killMeta}>{b.kill_alert.note || "A kill condition may have triggered — re-check before relying on these ideas."}</p>
              </div>
            </Callout>
          ) : null}

          {b.intro && <p className={s.intro}>{b.intro}</p>}

          {totals && (
            <div className={s.basket}>
              <div className={s.basketLabel}>{usd0(totals.invested)} basket · {totals.count} × {usd0(10_000)}</div>
              <div className={`${s.basketValue} t-num`}>{usd(totals.value)}</div>
              <div className={`${s.basketDelta} t-num ${totals.roiPct >= 0 ? "t-pos" : "t-neg"}`}>
                {signedUsd(totals.value - totals.invested)} · {pct(totals.roiPct, 2)}{totals.asOf ? <span className="t-3"> as of {fmtDate(totals.asOf)}</span> : null}
              </div>
              {totals.spyPct != null && totals.alphaPct != null && (
                <div className={s.basketBench}>
                  SPY {pct(totals.spyPct, 2)} over the same days · <span className={totals.alphaPct >= 0 ? "t-pos" : "t-neg"}>{pct(totals.alphaPct, 2)}</span> relative
                </div>
              )}
            </div>
          )}

          {isPricing && !totals && (
            <div className={s.pricing} aria-live="polite">
              <Skeleton lines={2} />
              <p className="t-caption">Pricing a {usd0(10_000)} stake in each idea at that day&apos;s close…</p>
            </div>
          )}
          {err && <Callout tone="warn">{err}</Callout>}
          {nothingPriced && <Callout>{priced?.error || "None of this day's ideas could be priced — each one says why below."}</Callout>}

          <ol className={s.ideas}>
            {b.items.map((o, i) => {
              const r = results[i];
              const v = o.verdict ? VERDICT[o.verdict] : undefined;
              return (
                <li key={i} className={s.idea}>
                  <div className={s.ideaHead}>
                    <strong className={s.ideaName}>{o.name}</strong>
                    {o.ticker && o.ticker !== "—" && <Ticker>{o.ticker}</Ticker>}
                    {v && <Badge tone={v.tone}>{v.label}</Badge>}
                  </div>
                  {o.horizon && <div className={s.ideaMeta}>Horizon {o.horizon}</div>}
                  {o.thesis && <p className={s.ideaThesis}>{o.thesis}</p>}
                  {(o.action || o.target) && (
                    <p className={s.ideaCall}>
                      {o.action && <strong>{o.action}</strong>}
                      {o.action && o.target ? " · " : ""}
                      {o.target}
                    </p>
                  )}
                  {o.outcome && <p className={s.ideaOutcome}><span>Since then:</span> {o.outcome}</p>}
                  {r && (isPriced(r) ? (
                    <div className={s.roi}>
                      <span className={`${s.roiLead} t-num`}>{usd(r.invested)} → {usd(r.value)}</span>
                      <span className={`t-num ${r.roiPct >= 0 ? "t-pos" : "t-neg"}`}>{signedUsd(r.value - r.invested)} · {pct(r.roiPct, 2)}</span>
                      {r.entryClose != null && r.entryDate && r.asOfDate && (
                        <span className={s.roiBasis}>
                          {r.entryQuote
                            ? `Entry ${r.entryQuote} on ${fmtDate(r.entryDate)} → ${r.asOfQuote} on ${fmtDate(r.asOfDate)}`
                            : `Entry ${usd(r.entryClose)} on ${fmtDate(r.entryDate)} → ${usd(r.asOfClose ?? 0)} on ${fmtDate(r.asOfDate)}`}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={s.roi}>
                      <span className={s.roiLead}>{usd0(10_000)} → not priced</span>
                      {r.skipped && <span className={s.roiBasis}>{r.skipped}</span>}
                    </div>
                  ))}
                </li>
              );
            })}
          </ol>

          <p className={s.method}>
            Each money value is a hypothetical {usd0(10_000)} at the idea&apos;s close on the brief date, valued at the latest close{totals?.asOf ? ` (${fmtDate(totals.asOf)})` : ""} — no fees, dividends or slippage.
            {b.reviewed_at ? " Review outcomes are summaries of public reporting since the brief — an honesty check, not a performance figure." : ""}
          </p>
        </div>
      )}
    </Sheet>
  );
}

export function BriefHistorySkeleton() {
  return (
    <div className="ui-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ui-row has-icon">
          <div className="ui-skel" style={{ width: 30, height: 30, borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <div className="ui-skel" style={{ height: 14, width: "40%" }} />
            <div className="ui-skel" style={{ height: 10, width: "60%", marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
