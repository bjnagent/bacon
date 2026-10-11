"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { BookmarkCheck, BookmarkPlus, CircleCheck, CircleDot, Clock, MessageCircle, OctagonX, ScanSearch, Share, Target, TriangleAlert } from "lucide-react";
import { Badge, Button, Delta, IconButton, Ticker } from "@/components/ui";
import TVLink from "@/components/TVLink";
import { evaluateTrigger } from "@/lib/triggers";
import {
  callTone, formatPrice, hasTicker, quoteLabel, splitCall, splitChecks, splitSignals, triggerView,
  type BriefItem, type QuoteLite,
} from "./brief";
import s from "./IdeaCard.module.css";

export type IdeaVariant = "live" | "preview" | "example";

/** Above this many characters the thesis starts clamped (the observer then measures properly). */
const CLAMP_GUESS = 240;

function QuoteChip({ q, fetchedAt, now }: { q: QuoteLite; fetchedAt: number; now: number }) {
  const lbl = quoteLabel(q, fetchedAt, now);
  return (
    <span className={s.quote} title={lbl.title}>
      <span className={s.price}>{formatPrice(q.price)}</span>
      {q.changePct != null && <Delta pct={q.changePct} />}
      {/* The label is not decoration: a delayed close shown as a live price is
          the same class of error as a fabricated one. */}
      <span className={lbl.live ? s.live : s.close}>{lbl.text}</span>
    </span>
  );
}

/**
 * One idea in the brief.
 *
 * `live` is a persisted idea with every action. `preview` is one still being
 * written by the stream — fields fill in as they arrive, so it shows no actions
 * (an Analyze on a half-written ticker would run on the wrong symbol). `example`
 * is the first-run illustration: marked on the card itself so it can't be read
 * as the user's own call in isolation, and deliberately inert.
 */
export default function IdeaCard({
  item, rank, variant = "live", quote, quoteFetchedAt = 0, now, tracked, onAnalyze, onTrack, onAsk, onShare,
}: {
  item: BriefItem;
  rank: number;
  variant?: IdeaVariant;
  quote?: QuoteLite;
  quoteFetchedAt?: number;
  now: number;
  tracked?: boolean;
  onAnalyze?: () => void;
  onTrack?: () => void;
  onAsk?: () => void;
  onShare?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(() => item.thesis.length > CLAMP_GUESS);
  const thesisRef = useRef<HTMLParagraphElement>(null);

  // Measure whether the clamped thesis actually overflows, so "More" appears
  // only when there is more. ResizeObserver reports once on observe and again
  // whenever the width changes (rotation, a hidden pane becoming visible).
  useLayoutEffect(() => {
    const el = thesisRef.current;
    if (!el || expanded || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (el.clientHeight > 0) setOverflows(el.scrollHeight > el.clientHeight + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.thesis, expanded]);

  const ticker = hasTicker(item) ? item.ticker.trim() : "";
  const call = splitCall(item.action);
  const tone = callTone(item.action);
  const checks = splitChecks(item.checks);
  const signals = splitSignals(item.signals);
  // Deterministic: has this call's own level been reached by the current price?
  // No model involved, so it is free and re-evaluates on every quote refresh.
  const trig = variant === "live" ? evaluateTrigger(item, quote?.price) : null;
  const tv = trig ? triggerView(trig) : null;
  const levels = [
    { k: "Target", v: item.target },
    // Advice mode only — the levels that make a call actionable rather than
    // directional. Empty in research mode, so the rows simply don't render.
    { k: "Entry", v: item.entry },
    { k: "Stop", v: item.stop },
    { k: "Size", v: item.size },
  ].filter((l) => l.v && l.v.trim());
  const hasCall = !!call.verb || levels.length > 0;

  return (
    <article
      className={`ui-card ${s.card}`}
      data-variant={variant}
      data-trigger={tv?.tone === "neg" ? "stop" : undefined}
      aria-label={`${rank}. ${item.name || ticker}`}
    >
      <header className={s.head}>
        <span className={s.rank} aria-hidden="true">{rank}</span>
        <div className={s.titles}>
          <h3 className={s.name}>
            {item.name || ticker || "Untitled idea"}
            {variant === "example" && <Badge tone="info">Example</Badge>}
          </h3>
          <div className={s.meta}>
            {ticker && <Ticker>{ticker}</Ticker>}
            {item.cls && <span className={s.cls}>{item.cls}</span>}
            {item.horizon && <Badge tone="outline" title="Horizon"><Clock aria-hidden="true" />{item.horizon}</Badge>}
            {quote && variant === "live" && <QuoteChip q={quote} fetchedAt={quoteFetchedAt} now={now} />}
          </div>
        </div>
      </header>

      <div className={hasCall ? s.body : s.bodyFull}>
        {hasCall && (
          <div className={s.call}>
            {tv && (
              // Ahead of the call itself: a breached stop is the one thing on
              // this card that changes what you do about everything else on it.
              <div className={s.trigger} data-tone={tv.tone} role="status">
                {trig!.kind === "stop" ? <TriangleAlert aria-hidden="true" /> : trig!.kind === "target" ? <Target aria-hidden="true" /> : <CircleDot aria-hidden="true" />}
                <span><strong>{tv.title}</strong> · {tv.body}</span>
              </div>
            )}
            {call.verb && (
              <div className={s.callHead}>
                <Badge tone={tone === "neutral" ? "neutral" : tone}>{call.verb}</Badge>
                {call.reason && <span className={s.callReason}>{call.reason}</span>}
              </div>
            )}
            {levels.length > 0 && (
              <dl className={s.levels}>
                {levels.map((l) => (
                  <div key={l.k} className={s.level} data-kind={l.k.toLowerCase()}>
                    <dt>{l.k}</dt>
                    <dd>{l.v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        <div className={s.main}>
          {item.thesis && (
            <div className={s.thesisWrap}>
              <p ref={thesisRef} className={`${s.thesis}${expanded ? "" : " t-clamp-3"}`}>{item.thesis}</p>
              {(overflows || expanded) && (
                <button type="button" className={s.more} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Less" : "More"}
                </button>
              )}
            </div>
          )}

          {signals.length > 0 && (
            <div className={s.block}>
              <div className={s.blockLabel}>Signals</div>
              {signals.length > 1
                ? <ul className={s.signals}>{signals.map((x, i) => <li key={i}>{x}</li>)}</ul>
                : <p className={s.blockText}>{signals[0]}</p>}
            </div>
          )}

          {(checks.confirm || checks.kill || checks.other) && (
            <div className={s.checks}>
              {checks.confirm && (
                <div className={s.check} data-kind="confirm">
                  <CircleCheck aria-hidden="true" />
                  <div><span className={s.checkLabel}>Confirm</span> {checks.confirm}</div>
                </div>
              )}
              {checks.kill && (
                <div className={s.check} data-kind="kill">
                  <OctagonX aria-hidden="true" />
                  <div><span className={s.checkLabel}>Kill</span> {checks.kill}</div>
                </div>
              )}
              {checks.other && (
                <div className={s.check} data-kind="other">
                  <CircleCheck aria-hidden="true" />
                  <div><span className={s.checkLabel}>Verify</span> {checks.other}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {variant === "live" && (
        <footer className={s.actions}>
          <Button variant="tonal" size="sm" className={s.primary} icon={<ScanSearch />} onClick={onAnalyze}>Analyze</Button>
          <Button
            size="sm"
            variant={tracked ? "ghost" : "secondary"}
            className={tracked ? s.trackOn : s.track}
            icon={tracked ? <BookmarkCheck /> : <BookmarkPlus />}
            aria-label={tracked ? `Tracking ${ticker || item.name} — open watchlist` : `Track ${ticker || item.name}`}
            aria-pressed={!!tracked}
            onClick={onTrack}
          >
            <span className={s.trackText}>{tracked ? "Tracking" : "Track"}</span>
          </Button>
          <span className={s.spacer} />
          <IconButton label="Ask Bacon about this idea" onClick={onAsk}><MessageCircle /></IconButton>
          <IconButton label="Share" onClick={onShare}><Share /></IconButton>
          {/* TradingView deep link; its title carries the attribution, and the
              brief's footer names TradingView in text. */}
          {ticker && <span className={s.tv}><TVLink sym={ticker} label={false} /></span>}
        </footer>
      )}
    </article>
  );
}
