"use client";

import { useState } from "react";
import { Plus, Check, Sparkles, Lock, ScanSearch, Compass } from "lucide-react";
import { Section, Badge, Ticker, Delta, Button, Callout, Sheet, Skeleton } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { apiFetch, ApiError, type ApiState } from "@/lib/client/api";
import { openPaywall } from "@/lib/client/paywall";
import { paths } from "@/lib/client/routes";
import { mapClass, relTime } from "@/lib/lenses";
import { METER_LABEL } from "@/lib/plans";
import type { ScoutPickRow } from "@/lib/types";
import type { ScoutResult } from "@/lib/parsers";
import ChartLink from "./ChartLink";
import { useEvent } from "./useEvent";
import { classShort, parseMovePct, pickSymbol } from "./logic";
import type { SettingsData } from "./ThemesSection";
import s from "./Watchlist.module.css";

/** One idea card, whether it came from last night's sweep or an on-demand scout. */
interface Find {
  key: string;
  kind: "mover" | "theme" | "scout";
  name: string;
  ticker: string;
  cls: string;
  why: string;
  now: string;
  check: string;
  /** Provider-measured % move (movers only) and who measured it. */
  move: number | null;
  moveRaw: string | null;
  source: string | null;
}

const fromRow = (p: ScoutPickRow): Find => ({
  key: p.id, kind: p.kind === "mover" ? "mover" : "theme", name: p.name, ticker: p.symbol, cls: mapClass(p.asset_class),
  why: p.why, now: p.now_catalyst, check: p.check_text,
  move: p.kind === "mover" ? parseMovePct(p.change_pct) : null, moveRaw: p.kind === "mover" ? p.change_pct : null,
  source: p.kind === "mover" ? p.data_source : null,
});

const fromScout = (r: ScoutResult): Find[] => r.picks.map((p, i) => ({
  key: `scout-${i}-${p.ticker || p.name}`, kind: "scout", name: p.name || p.ticker, ticker: p.ticker, cls: mapClass(p.cls),
  why: p.why, now: p.now, check: p.check, move: null, moveRaw: null, source: null,
}));

function KindBadge({ f }: { f: Find }) {
  if (f.kind === "mover") return <Badge tone="info">Mover</Badge>;
  if (f.kind === "theme") return <Badge tone="accent">Theme pick</Badge>;
  return <Badge tone="accent">For your themes</Badge>;
}

/** The provider-attributed move, or the raw provider string if it isn't a plain number. Never estimated. */
function MoveLine({ f }: { f: Find }) {
  if (f.kind !== "mover" || (f.move == null && !f.moveRaw)) return null;
  return (
    <span className={s.findSrc}>
      {f.move != null ? <Delta pct={f.move} digits={1} /> : <strong>{f.moveRaw}</strong>}
      {" "}move{f.source ? ` · via ${f.source}` : ""}
    </span>
  );
}

function FindCard({ f, onOpen }: { f: Find; onOpen: () => void }) {
  const app = useApp();
  const sym = pickSymbol(f.ticker, f.name);
  const tracked = app.isTracked(sym);
  const hasTicker = !!f.ticker && f.ticker !== "—";
  return (
    <div className={s.find}>
      <button type="button" className={s.findTap} onClick={onOpen} aria-label={`${f.name}${hasTicker ? ` (${f.ticker})` : ""} — details`}>
        <span className={s.findTop}>
          <KindBadge f={f} />
          <span className="t-caption">{classShort(f.cls)}</span>
        </span>
        <span className={s.findName}>
          <span className={s.findNameText}>{f.name}</span>
          {hasTicker && f.ticker !== f.name && <Ticker>{f.ticker}</Ticker>}
        </span>
        <MoveLine f={f} />
        <span className={`${s.findWhy} t-clamp-3`}>{f.why}</span>
      </button>
      <div className={s.findActions}>
        <Button size="sm" variant={tracked ? "ghost" : "secondary"} icon={tracked ? <Check /> : <Plus />} disabled={tracked} onClick={() => void app.trackSymbol(sym, f.cls)}>
          {tracked ? "Tracking" : "Track"}
        </Button>
        <Button size="sm" variant="ghost" icon={<ScanSearch />} onClick={() => app.openAnalyze({ asset: sym, cls: f.cls, run: true })}>Analyze</Button>
      </div>
    </div>
  );
}

function FindSheet({ f, onClose }: { f: Find; onClose: () => void }) {
  const app = useApp();
  const sym = pickSymbol(f.ticker, f.name);
  const tracked = app.isTracked(sym);
  const hasTicker = !!f.ticker && f.ticker !== "—";
  return (
    <Sheet open onClose={onClose} title={f.name}>
      <div className="stack-lg">
        <div className="row-wrap">
          <KindBadge f={f} />
          {hasTicker && <Ticker>{f.ticker}</Ticker>}
          <span className="t-caption">{f.cls}</span>
        </div>
        {f.kind === "mover" && (f.move != null || f.moveRaw) && (
          <Callout tone="info">
            One of the last session&apos;s biggest movers: {f.move != null ? <Delta pct={f.move} digits={1} /> : f.moveRaw}{f.source ? `, measured by ${f.source}` : ""}. Momentum fades — verify at the source before acting.
          </Callout>
        )}
        <div className={s.block}>
          <span className={s.blockLabel}>Why it&apos;s here</span>
          <p className={s.blockText}>{f.why}</p>
        </div>
        {f.now && (
          <div className={s.block}>
            <span className={s.blockLabel}>Why now</span>
            <p className={s.blockText}>{f.now}</p>
          </div>
        )}
        {f.check && (
          <div className={s.block}>
            <span className={s.blockLabel}>What to check</span>
            <p className={s.blockText}>{f.check}</p>
          </div>
        )}
        <div className={s.actionGrid}>
          <Button variant="primary" icon={tracked ? <Check /> : <Plus />} disabled={tracked} onClick={() => void app.trackSymbol(sym, f.cls)}>
            {tracked ? "Tracking" : `Track ${hasTicker ? f.ticker : ""}`.trim()}
          </Button>
          <Button icon={<ScanSearch />} onClick={() => { onClose(); app.openAnalyze({ asset: sym, cls: f.cls, run: true }); }}>Analyze</Button>
        </div>
        {hasTicker && <ChartLink sym={f.ticker} />}
        <p className="t-caption" style={{ textAlign: "center" }}>An idea to research, not a recommendation.</p>
      </div>
    </Sheet>
  );
}

function FindsSkeleton() {
  return (
    <div className={s.finds} aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className={s.find}>
          <Skeleton height={20} width="40%" />
          <Skeleton height={18} width="70%" />
          <Skeleton lines={3} />
        </div>
      ))}
    </div>
  );
}

/**
 * "Fresh finds": the movers (with the provider's measured % move) and theme
 * picks last night's sweep saved, plus an on-demand scout across the member's
 * themes. The scout is a Pro feature (personal_brief) and costs one refresh.
 */
export default function FreshFinds({ picksApi, settingsApi, themes }: {
  picksApi: ApiState<{ picks?: ScoutPickRow[] }>;
  settingsApi: ApiState<SettingsData>;
  themes: string[];
}) {
  const app = useApp();
  const [open, setOpen] = useState<Find | null>(null);
  const closeFind = useEvent(() => setOpen(null));
  const [scout, setScout] = useState<ScoutResult | null>(null);
  const [scouting, setScouting] = useState(false);
  const [scoutErr, setScoutErr] = useState<string | null>(null);

  const unlocked = app.can("personal_brief");
  const finds = (picksApi.data?.picks ?? []).map(fromRow);
  const scoutFinds = scout ? fromScout(scout) : [];
  const settings = settingsApi.data?.settings;
  const swept = relTime(settings?.last_sweep_at);
  const sweepOn = (settings?.scout_interval_minutes ?? 0) > 0;
  const left = app.remaining("update");

  const runScout = async () => {
    if (scouting) return;
    setScouting(true); setScoutErr(null);
    try {
      const r = await apiFetch<{ result?: ScoutResult }>("/api/scout", { body: { themes } });
      if (r.result) setScout(r.result);
      void app.refreshMe();
    } catch (err) {
      // A 402 has already opened the paywall; say nothing more about it here.
      if (!(err instanceof ApiError && err.isUpgrade)) setScoutErr(err instanceof Error ? err.message : "Scouting failed — try again.");
    } finally { setScouting(false); }
  };

  const sub = finds.length
    ? `From the nightly sweep${swept ? ` · ${swept}` : ""}`
    : "Movers and theme picks from the nightly sweep";

  return (
    <Section title="Fresh finds" sub={sub}>
      {picksApi.loading && !picksApi.data ? (
        <FindsSkeleton />
      ) : picksApi.error && !picksApi.data ? (
        <Callout tone="neg">
          {picksApi.error.message}
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => void picksApi.refresh()}>Try again</Button></div>
        </Callout>
      ) : finds.length > 0 ? (
        <div className={s.finds}>
          {finds.map((f) => <FindCard key={f.key} f={f} onOpen={() => setOpen(f)} />)}
        </div>
      ) : unlocked ? (
        sweepOn ? (
          <Callout icon={<Compass />}>Your first fresh finds land with tonight&apos;s sweep — today&apos;s biggest movers and new names for your themes.</Callout>
        ) : (
          <Callout icon={<Compass />}>
            The nightly sweep is off, so there are no fresh finds yet. Turn on your daily brief and they arrive every morning.
            <div style={{ marginTop: 10 }}><Button size="sm" onClick={() => app.navigate(paths.account("brief"))}>Turn on in Account</Button></div>
          </Callout>
        )
      ) : null}

      {unlocked ? (
        <div className="stack">
          <div className={s.scoutBar}>
            <Button variant="tonal" icon={<Sparkles />} loading={scouting} onClick={() => void runScout()}>
              {scouting ? "Scouting…" : themes.length ? "Find ideas for my themes" : "Find ideas now"}
            </Button>
            {!scouting && (
              <span className={s.scoutHint}>
                {left == null ? "Uses one refresh" : left === 0 ? "No refreshes left this month" : `Uses one refresh · ${left} ${left === 1 ? METER_LABEL.update.one : METER_LABEL.update.many} left`}
              </span>
            )}
          </div>
          {scouting && (
            <div aria-live="polite" className="stack-sm">
              <span className="t-callout">Searching the public record for timely candidates{themes.length ? ` across ${themes.length === 1 ? "your theme" : `your ${themes.length} themes`}` : ""}. This takes about half a minute.</span>
              <FindsSkeleton />
            </div>
          )}
          {scoutErr && !scouting && (
            <Callout tone="neg">
              {scoutErr}
              <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => void runScout()}>Try again</Button></div>
            </Callout>
          )}
          {scout && !scouting && (
            <div className="stack">
              {scout.intro && <p className={s.scoutIntro}>{scout.intro}</p>}
              <div className={s.finds}>
                {scoutFinds.map((f) => <FindCard key={f.key} f={f} onOpen={() => setOpen(f)} />)}
              </div>
              {scout.caveat && <p className="t-caption">{scout.caveat}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className={s.locked}>
          <span className={s.lockedIcon}><Lock /></span>
          <div className={s.lockedBody}>
            <span className={s.lockedTitle}>Ideas built around your themes</span>
            <span className={s.lockedText}>Pro scouts fresh, catalyst-backed names for each of your themes — every night in your brief, and on demand here.</span>
            <div className={s.lockedAction}>
              <Button size="sm" variant="primary" onClick={() => openPaywall({ reason: "feature", feature: "personal_brief", suggested: "pro" })}>Upgrade</Button>
            </div>
          </div>
        </div>
      )}

      {open && <FindSheet f={open} onClose={closeFind} />}
    </Section>
  );
}
