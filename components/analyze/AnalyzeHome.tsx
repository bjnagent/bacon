"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { AlertTriangle, History, Minus, ScanSearch, Search, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Button, Callout, Card, Chip, EmptyState, List, PageHeader, Row, Section, Skeleton, UsageMeter } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { useApi } from "@/lib/client/api";
import { ASSET_CLASSES, LENSES, relTime, splitSymCls } from "@/lib/lenses";
import { symbolKey, type AnalysisListItem } from "@/lib/analysisStore";
import { useAllowance } from "./useAllowance";
import { LEAN_UI, lensVar } from "./model";
import s from "./Analyze.module.css";

const STALE_MS = 2 * 60_000;

function LeanIcon({ item }: { item: AnalysisListItem }) {
  const tone = item.lean ? LEAN_UI[item.lean].tone : "neutral";
  const Icon = tone === "pos" ? TrendingUp : tone === "neg" ? TrendingDown : Minus;
  return <Icon className={s.leanIcon} data-tone={tone} />;
}

export default function AnalyzeHome({ active, version, onOpen }: {
  /** On screen (this tab, and not showing an analysis). */
  active: boolean;
  /** Bumped when history changes elsewhere (a run was filed). */
  version: number;
  onOpen: (item: AnalysisListItem) => void;
}) {
  const app = useApp();
  const allowance = useAllowance();
  const [query, setQuery] = useState("");
  // The class follows what's typed ("EUR/USD" → FX) until the member picks one.
  const [pickedCls, setPickedCls] = useState<string | null>(null);
  const guessed = splitSymCls(query || "X").cls;
  const cls = pickedCls ?? guessed;
  const inputRef = useRef<HTMLInputElement>(null);

  const recent = useApi<{ items: AnalysisListItem[] }>("/api/analyses", 60_000);
  const loadedAt = useRef(0);
  const seenVersion = useRef(version);
  const { data, refresh } = recent;
  useEffect(() => { if (data) loadedAt.current = Date.now(); }, [data]);
  // Kept mounted while hidden: refresh on return only when stale or changed.
  useEffect(() => {
    if (!active) return;
    const changed = seenVersion.current !== version;
    if (!changed && Date.now() - loadedAt.current < STALE_MS) return;
    seenVersion.current = version;
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [active, version, refresh]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = query.trim();
    if (!raw) { inputRef.current?.focus(); return; }
    const { sym, cls: hinted } = splitSymCls(raw);
    app.openAnalyze({ asset: sym, cls: pickedCls ?? hinted, run: true });
    setQuery("");
    setPickedCls(null);
    inputRef.current?.blur();
  };

  const items = recent.data?.items ?? [];
  // One chip per symbol, even if the list briefly holds an optimistic duplicate.
  const chips = app.watchlist.filter((w, i, all) => all.findIndex((x) => x.symbol === w.symbol) === i).slice(0, 16);

  return (
    <div className="page">
      <PageHeader title="Analyze" subtitle="Eight independent lenses on any stock, ETF, currency, crypto or commodity." />

      <Card pad="lg" className={s.searchCard}>
        <form className={s.searchForm} onSubmit={submit} role="search">
          <div className={`ui-search ${s.searchField}`}>
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              className="ui-input"
              type="search"
              inputMode="search"
              enterKeyHint="go"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Ticker or company name"
              aria-label="Ticker or company name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className={s.searchControls}>
            <label className="sr-only" htmlFor="analyze-cls">Asset class</label>
            <select id="analyze-cls" className={`ui-select ${s.select}`} value={cls} onChange={(e) => setPickedCls(e.target.value)}>
              {ASSET_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Button type="submit" variant="primary" icon={<ScanSearch />} className={s.runBtn}>Run analysis</Button>
          </div>
        </form>
        {allowance && (
          <div className={s.allowance}>
            <UsageMeter used={allowance.limit - allowance.left} limit={allowance.limit} />
            <div className={s.allowanceRow}>
              <span className={allowance.low ? s.allowanceLow : undefined}>
                {allowance.out
                  ? `You've used all ${allowance.limit} deep dives this month — reopening recent ones stays free.`
                  : `${allowance.left} of ${allowance.limit} deep dives left this month`}
              </span>
              {allowance.low && <button type="button" className="section-action" onClick={allowance.upgrade}>Upgrade</button>}
            </div>
          </div>
        )}
      </Card>

      {(chips.length > 0 || !app.watchlistLoaded) && (
        <Section title="From your watchlist">
          <div className="hscroll" aria-busy={!app.watchlistLoaded}>
            {!app.watchlistLoaded
              ? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={36} width={72} style={{ borderRadius: 999 }} />)
              : chips.map((w) => (
                <Chip key={w.id} onClick={() => app.openAnalyze({ asset: w.symbol, cls: w.asset_class, run: true })}>
                  <span className="t-mono">{w.symbol}</span>
                </Chip>
              ))}
          </div>
        </Section>
      )}

      <Section title="Recent" sub={items.length ? "Reopening an analysis is free." : undefined}>
        {recent.loading && !recent.data ? (
          <div className="ui-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ui-row has-icon">
                <Skeleton height={30} width={30} />
                <span className="ui-row-body"><Skeleton height={14} width="30%" /><Skeleton height={12} width="55%" style={{ marginTop: 6 }} /></span>
              </div>
            ))}
          </div>
        ) : recent.error && !recent.data ? (
          <Callout tone="neg" icon={<AlertTriangle />}>
            <strong>Couldn&apos;t load your recent analyses.</strong> {recent.error.message}
            <div className={s.calloutActions}><Button size="sm" onClick={() => void recent.refresh()}>Try again</Button></div>
          </Callout>
        ) : items.length === 0 ? (
          <Card flat>
            <EmptyState
              icon={<History />}
              title="No analyses yet"
              body="Run a deep dive above. Every analysis is saved here, and reopening one never uses your allowance."
            />
          </Card>
        ) : (
          <List>
            {items.map((it) => {
              const typed = it.query && symbolKey(it.query) !== it.symbol ? it.query : null;
              return (
                <Row
                  key={it.id}
                  icon={<LeanIcon item={it} />}
                  title={<span className={s.rowTitle}><span className={s.rowSym}>{it.symbol}</span>{typed && <span className={s.rowTyped}>{typed}</span>}</span>}
                  sub={[it.asset_class, it.call, relTime(it.created_at)].filter(Boolean).join(" · ")}
                  trailing={it.lean ? <Badge tone={LEAN_UI[it.lean].tone}>{LEAN_UI[it.lean].short}</Badge> : null}
                  chevron
                  onClick={() => onOpen(it)}
                />
              );
            })}
          </List>
        )}
      </Section>

      <Section title="The eight lenses" sub="Each reads the same name independently; the verdict weighs where they agree.">
        <ul className={s.lensLegend}>
          {LENSES.map((l) => (
            <li key={l.key} style={{ "--hue": lensVar(l.key) } as CSSProperties}>
              <span className={s.lensLegendName}>{l.name}</span>
              <span className={s.lensLegendBlurb}>{l.blurb}</span>
            </li>
          ))}
        </ul>
      </Section>

      <p className={`t-caption ${s.disclaimer}`}>Research, not investment advice.</p>
    </div>
  );
}
