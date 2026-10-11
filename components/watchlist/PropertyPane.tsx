"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Check, Plus } from "lucide-react";
import { Section, Badge, Button, Callout, EmptyState, SkeletonCard, Skeleton, toast } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { apiStream, ApiError, useApi } from "@/lib/client/api";
import { invalidate } from "@/lib/clientCache";
import { openPaywall } from "@/lib/client/paywall";
import { relTime } from "@/lib/lenses";
import { OutlookSheet, HoldingSheet, AddPropertySheet } from "./PropertySheets";
import { marketLevel, money, outlookStance, pct, quarterLabel, toOutlook, type Holding, type Market, type Outlook, type PropertyData } from "./propertyLogic";
import { plural } from "./logic";
import { useEvent } from "./useEvent";
import s from "./Watchlist.module.css";

/** Tiny trend line of the real index (oldest → newest). Decorative; the numbers sit beside it. */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className={s.spark} aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24 - 2}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 100 28" className={s.spark} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "var(--pos)" : "var(--neg)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function LockedProperty() {
  return (
    <div className="ui-card">
      <div className={s.lockHero}>
        <span className={s.lockedIcon}><Building2 /></span>
        <div className={s.lockHeroTitle}>Track your home against the market</div>
        <div className={s.lockList}>
          <div className={s.lockItem}><Check aria-hidden="true" /><span>Real price indices for Singapore (HDB resale, URA private) and Australia (Sydney, Melbourne, Brisbane), straight from the official sources.</span></div>
          <div className={s.lockItem}><Check aria-hidden="true" /><span>Your properties valued against their market index since you bought — clearly labelled as an estimate, never an appraisal.</span></div>
          <div className={s.lockItem}><Check aria-hidden="true" /><span>A researched outlook for each market: policy, rates, supply and rents, with what would confirm or kill the view.</span></div>
        </div>
        <Button variant="primary" onClick={() => openPaywall({ reason: "feature", feature: "property", suggested: "pro" })}>Upgrade to Pro</Button>
      </div>
    </div>
  );
}

function HoldingRow({ h, market, onOpen }: { h: Holding; market: Market | undefined; onOpen: () => void }) {
  const ccy = market?.currency ?? "";
  const v = h.valuation;
  return (
    <button type="button" className={`${s.row} ${s.rowWrap}`} onClick={onOpen}>
      <span className={s.rowHead}><span className={s.sym}>{h.label}</span></span>
      <span className={s.price}>{v ? money(v.value, ccy) : "—"}</span>
      <span className={s.meta}>{market?.label ?? h.market_key}</span>
      <span className={s.move}>{v && <span className={`ui-delta ${v.deltaPct > 0 ? "is-up" : v.deltaPct < 0 ? "is-down" : "is-flat"}`}>{pct(v.deltaPct, 1)}</span>}</span>
      <span className={`${s.update} ${s.isMuted}`}>
        {v ? `Index estimate · ${market?.source ?? "index"} · as of ${quarterLabel(v.asOfDate)}` : "No estimate yet — the index for this market isn't available right now."}
      </span>
    </button>
  );
}

function MarketRow({ m, outlook, busy, onOpen }: { m: Market; outlook: Outlook | null; busy: boolean; onOpen: () => void }) {
  const level = marketLevel(m);
  const stance = outlook ? outlookStance(outlook) : null;
  const yoy = m.stats?.yoyPct;
  return (
    <button type="button" className={`${s.row} ${s.mRow} ${s.rowWrap}`} onClick={onOpen}>
      <span className={`${s.rowHead} ${s.mTitle}`}><span className={s.sym}>{m.label}</span></span>
      <span className={s.mSpark}>{m.stats && <Spark values={m.stats.spark} />}</span>
      <span className={`${s.price} ${s.mPrice}`}>{level ?? "—"}</span>
      <span className={`${s.meta} ${s.mMeta}`}>{m.stats ? `${m.source} · ${quarterLabel(m.stats.latest.date)}` : `Waiting on ${m.source}`}</span>
      <span className={`${s.move} ${s.mMove}`}>
        {yoy != null && <><span className={s.src}>YoY</span><span className={`ui-delta ${yoy > 0 ? "is-up" : yoy < 0 ? "is-down" : "is-flat"}`}>{pct(yoy)}</span></>}
      </span>
      <span className={s.update}>
        {busy ? <span className="t-3">Writing the outlook…</span>
          : stance ? <span className={s.leanLine}><Badge tone={stance.tone}>{stance.label}</Badge><span>{outlook?.read}</span></span>
            : <span className="t-3">No outlook yet · tap for one</span>}
      </span>
    </button>
  );
}

/**
 * The SG/AU property tracker: the member's properties valued against real
 * market indices (index-implied estimates with their source and as-of date —
 * never appraisals), the markets themselves, and a researched outlook per
 * market. Paid feature: a plan without it sees what it is and an upgrade.
 */
export default function PropertyPane({ addOpen, onAdd, onAddClose, refreshNonce }: {
  addOpen: boolean;
  onAdd: () => void;
  onAddClose: () => void;
  refreshNonce: number;
}) {
  const app = useApp();
  const locked = !app.can("property");
  const api = useApi<PropertyData>(locked ? null : "/api/property", 120_000);
  const [streamed, setStreamed] = useState<Record<string, Outlook>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [marketKey, setMarketKey] = useState<string | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const closeMarket = useEvent(() => setMarketKey(null));
  const closeHolding = useEvent(() => setHoldingId(null));

  const firstNonce = useRef(refreshNonce);
  const { refresh } = api;
  useEffect(() => {
    if (refreshNonce === firstNonce.current || locked) return;
    void refresh();
  }, [refreshNonce, locked, refresh]);

  const markets = api.data?.markets ?? [];
  const portfolio = api.data?.portfolio ?? [];
  const saved = api.data?.outlooks ?? {};
  const outlookFor = (key: string): Outlook | null => streamed[key] ?? saved[key]?.body ?? null;
  const marketOf = (key: string) => markets.find((m) => m.key === key);

  const runOutlook = useCallback(async (key: string) => {
    if (busy) return;
    setBusy(key);
    try {
      const final = await apiStream("/api/property/outlook", { market: key }, (acc) => {
        const o = toOutlook(acc);
        if (o) setStreamed((prev) => ({ ...prev, [key]: o }));
      });
      if (!toOutlook(final)) throw new ApiError(502, { error: "The outlook came back empty — try again." });
      invalidate("/api/property");
      toast("Outlook updated");
    } catch (err) {
      // Drop a half-written outlook rather than leave it looking finished.
      setStreamed((prev) => { const n = { ...prev }; delete n[key]; return n; });
      if (!(err instanceof ApiError && err.isUpgrade)) toast.error(err instanceof Error ? err.message : "Couldn't write the outlook — try again.");
    } finally {
      setBusy(null);
      void app.refreshMe();
    }
  }, [busy, app]);

  if (locked) return <LockedProperty />;

  const loading = api.loading && !api.data;
  const noData = !!api.data && markets.length > 0 && markets.every((m) => !m.stats);
  const openMarket = marketKey ? marketOf(marketKey) : undefined;
  const openHolding = holdingId ? portfolio.find((h) => h.id === holdingId) : undefined;

  return (
    <div className={s.col}>
      {api.error && !api.data ? (
        <Callout tone="neg">
          {api.error.message}
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => void api.refresh()}>Try again</Button></div>
        </Callout>
      ) : null}

      {noData && (
        <Callout tone="warn">
          The index providers didn&apos;t answer just now, so there are no levels or estimates to show. Nothing is filled in by guesswork — check back later.
        </Callout>
      )}

      <div className={s.propGrid}>
      <Section
        title="Your properties"
        sub={portfolio.length ? `${plural(portfolio.length, "property", "properties")} · index estimates` : undefined}
      >
        {loading ? (
          <SkeletonCard lines={2} />
        ) : portfolio.length === 0 ? (
          <div className="ui-card">
            <EmptyState
              icon={<Building2 />}
              title="Add your first property"
              body="Enter what you paid and when. Bacon scales it by the real market index since then — an index-implied estimate, not an appraisal."
              actions={<Button variant="primary" icon={<Plus />} onClick={onAdd}>Add property</Button>}
            />
          </div>
        ) : (
          <div>
            <div className={s.list}>
              {portfolio.map((h) => <HoldingRow key={h.id} h={h} market={marketOf(h.market_key)} onOpen={() => setHoldingId(h.id)} />)}
            </div>
            <p className={s.listFoot}>
              Estimates scale your purchase price by the market index since you bought. They ignore the specific property, renovations, lease decay and transaction costs — a study aid, not an appraisal.
            </p>
          </div>
        )}
      </Section>

      <Section title="Markets" sub="Official indices, published quarterly — they lag">
        {loading ? (
          <div className={s.list} aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className={s.skelRow}><Skeleton height={16} width="60%" /><Skeleton height={16} /><Skeleton height={12} width="45%" /><Skeleton height={12} /></div>)}
          </div>
        ) : (
          <div className={s.list}>
            {markets.map((m) => (
              <MarketRow key={m.key} m={m} outlook={outlookFor(m.key)} busy={busy === m.key} onOpen={() => setMarketKey(m.key)} />
            ))}
          </div>
        )}
      </Section>
      </div>

      {openMarket && (
        <OutlookSheet
          market={openMarket}
          outlook={outlookFor(openMarket.key)}
          savedAt={streamed[openMarket.key] ? null : relTime(saved[openMarket.key]?.created_at)}
          busy={busy === openMarket.key}
          otherBusy={!!busy && busy !== openMarket.key}
          onRefresh={() => void runOutlook(openMarket.key)}
          onClose={closeMarket}
        />
      )}
      {openHolding && (
        <HoldingSheet
          h={openHolding}
          market={marketOf(openHolding.market_key)}
          onClose={closeHolding}
          onRemoved={() => { setHoldingId(null); void api.refresh(); }}
        />
      )}
      <AddPropertySheet open={addOpen} markets={markets} onClose={onAddClose} onAdded={() => void api.refresh()} />
    </div>
  );
}
