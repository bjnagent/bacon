"use client";

import { useState } from "react";
import { ChevronDown, Telescope, Trash2 } from "lucide-react";
import { Sheet, Badge, Button, Callout, List, Row, toast } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { apiFetch, ApiError } from "@/lib/client/api";
import { invalidate } from "@/lib/clientCache";
import { METER_LABEL } from "@/lib/plans";
import { formatDay } from "./logic";
import { useEvent } from "./useEvent";
import {
  OUTLOOK_DRIVERS, marketLevel, money, outlookStance, pct, quarterLabel, todayYmd, validateProperty,
  type Holding, type Market, type Outlook,
} from "./propertyLogic";
import s from "./Watchlist.module.css";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className={s.stat}>
      <div className={s.statLabel}>{label}</div>
      <div className={`${s.statValue}${tone ? ` t-${tone}` : ""}`}>{value}</div>
    </div>
  );
}

const signTone = (n: number | null | undefined) => (n == null ? undefined : n > 0 ? "pos" : n < 0 ? "neg" : undefined);

/** One market: the real index numbers, then the researched outlook and its checkpoints. */
export function OutlookSheet({ market, outlook, savedAt, busy, otherBusy, onRefresh, onClose }: {
  market: Market;
  outlook: Outlook | null;
  savedAt: string | null;
  busy: boolean;
  otherBusy: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const app = useApp();
  const left = app.remaining("update");
  const stance = outlook ? outlookStance(outlook) : null;
  const st = market.stats;
  return (
    <Sheet open onClose={onClose} title={market.label} variant="side">
      <div className="stack-lg">
        {st ? (
          <div className="stack-sm">
            <div className={s.statGrid}>
              <Stat label={market.unit === "price" ? "Mean price" : "Index"} value={marketLevel(market) ?? "—"} />
              <Stat label="QoQ" value={pct(st.qoqPct)} tone={signTone(st.qoqPct)} />
              <Stat label="YoY" value={pct(st.yoyPct)} tone={signTone(st.yoyPct)} />
            </div>
            <span className="t-caption">{market.source} · {quarterLabel(st.latest.date)} (as of {formatDay(st.latest.date)}) · published quarterly, so it lags</span>
          </div>
        ) : (
          <Callout tone="warn">{market.source} didn&apos;t return data just now, so there are no index levels to show. The outlook says so rather than guess.</Callout>
        )}

        {outlook && stance ? (
          <>
            <div className="stack-sm" aria-live="polite">
              <div className="row-wrap">
                <Badge tone={stance.tone}>{stance.label}</Badge>
                {savedAt && <span className="t-caption">Written {savedAt}</span>}
                {busy && <span className="t-caption">Writing…</span>}
              </div>
              {outlook.verdict && <div className={s.verdict}>{outlook.verdict}</div>}
              <p className={s.blockText}>{outlook.read}</p>
            </div>

            {(outlook.confirm || outlook.kill) && (
              <div className={s.ck}>
                {outlook.confirm && <div className={`${s.ckCard} ${s.isPos}`}><span className={s.ckLabel}>Confirms the view</span><span className={s.ckText}>{outlook.confirm}</span></div>}
                {outlook.kill && <div className={`${s.ckCard} ${s.isNeg}`}><span className={s.ckLabel}>Kills the view</span><span className={s.ckText}>{outlook.kill}</span></div>}
              </div>
            )}

            {OUTLOOK_DRIVERS.some((d) => outlook[d.key]) && (
              <div className={s.block}>
                <span className={s.blockLabel}>Drivers</span>
                <div className={s.drivers}>
                  {OUTLOOK_DRIVERS.filter((d) => outlook[d.key]).map((d) => (
                    <div key={d.key} className={s.driver}><span className={s.driverLabel}>{d.label}</span><span className={s.driverText}>{outlook[d.key]}</span></div>
                  ))}
                </div>
              </div>
            )}
            {outlook.drivers && <p className={s.blockText}>{outlook.drivers}</p>}

            {outlook.scenarios && (
              <div className={s.block}><span className={s.blockLabel}>12-month scenarios (estimates)</span><p className={s.blockText}>{outlook.scenarios}</p></div>
            )}
            {outlook.longrun && (
              <div className={s.block}><span className={s.blockLabel}>5- and 10-year view (estimates)</span><p className={s.blockText}>{outlook.longrun}</p></div>
            )}
            {outlook.carry && (
              <div className={s.block}><span className={s.blockLabel}>Rent vs. mortgage</span><p className={s.blockText}>{outlook.carry}</p></div>
            )}
          </>
        ) : (
          <p className={`${s.blockText} ${s.isMuted}`}>
            {busy ? "Researching policy, rates, supply, sentiment and rents…" : "No outlook yet. Bacon researches policy, rates, supply, sentiment and rents for this market, then states a view and what would confirm or kill it."}
          </p>
        )}

        <div className={s.refreshRow}>
          <Button variant="tonal" block icon={<Telescope />} loading={busy} disabled={otherBusy} onClick={onRefresh}>
            {busy ? "Writing the outlook…" : outlook ? "Refresh outlook" : "Get the outlook"}
          </Button>
          <span className={s.refreshHint}>
            {otherBusy ? "Another outlook is being written." : left == null ? "Uses one refresh from your plan." : left === 0 ? "No refreshes left this month — upgrade for more." : `Uses one refresh · ${left} ${left === 1 ? METER_LABEL.update.one : METER_LABEL.update.many} left this month`}
          </span>
        </div>
        <p className="t-caption" style={{ textAlign: "center" }}>Research, not investment advice. Scenarios are estimates.</p>
      </div>
    </Sheet>
  );
}

/** One of the member's properties: the estimate, how it was derived, and removal. */
export function HoldingSheet({ h, market, onClose, onRemoved }: { h: Holding; market: Market | undefined; onClose: () => void; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const ccy = market?.currency ?? "";
  const v = h.valuation;

  const remove = async () => {
    setRemoving(true);
    try {
      await apiFetch(`/api/property/${h.id}`, { method: "DELETE" });
      invalidate("/api/property");
      toast(`${h.label} removed`);
      onRemoved();
    } catch (err) {
      setRemoving(false);
      toast.error(err instanceof Error ? err.message : "Couldn't remove that — try again.");
    }
  };

  return (
    <Sheet open onClose={onClose} title={h.label}>
      <div className="stack-lg">
        <div className={s.dHead}>
          <div>
            <div className={s.dClass}>Index estimate</div>
            <div className={s.dPriceNum} style={{ marginTop: 4 }}>{v ? money(v.value, ccy) : "Not available"}</div>
          </div>
          {v && (
            <div className={s.dPrice}>
              <div className={`ui-delta ${v.deltaPct > 0 ? "is-up" : v.deltaPct < 0 ? "is-down" : "is-flat"}`} style={{ fontSize: "var(--fs-lg)" }}>{pct(v.deltaPct, 2)}</div>
              <div className={s.dPriceSub}>since purchase</div>
            </div>
          )}
        </div>

        {!v && <Callout tone="warn">The index for this market isn&apos;t available right now, so there is no estimate to show. Nothing is filled in by guesswork.</Callout>}

        <List>
          <Row title="Market" value={market?.label ?? h.market_key} />
          <Row title="Bought" value={formatDay(h.purchase_date)} />
          <Row title="Paid" value={money(Number(h.purchase_price), ccy)} />
          {v && <Row title="Index basis" value={`${quarterLabel(v.entryDate)} → ${quarterLabel(v.asOfDate)}`} />}
          {v && v.entryLevel != null && v.asOfLevel != null && <Row title="Index level" value={`${v.entryLevel.toFixed(1)} → ${v.asOfLevel.toFixed(1)}`} />}
          <Row title="Source" value={market?.source ?? "—"} />
        </List>
        {h.notes && <p className={s.blockText}>{h.notes}</p>}

        <p className="t-caption">
          The estimate scales what you paid by the market index&apos;s move since you bought. It ignores the specific property, renovations, lease decay and transaction costs — a study aid, not an appraisal or advice.
        </p>

        {confirming ? (
          <div className={s.confirm} role="alertdialog" aria-label={`Remove ${h.label}?`}>
            <div className={s.confirmText}>Remove <strong>{h.label}</strong> from your properties?</div>
            <div className={s.confirmActions}>
              <Button onClick={() => setConfirming(false)} disabled={removing}>Cancel</Button>
              <Button variant="danger" loading={removing} onClick={() => void remove()}>Remove</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" block icon={<Trash2 />} className={s.removeBtn} onClick={() => setConfirming(true)}>Remove property</Button>
        )}
      </div>
    </Sheet>
  );
}

const EMPTY_FORM = { label: "", market_key: "sg-hdb", purchase_price: "", purchase_date: "" };
type FieldKey = "label" | "market_key" | "purchase_price" | "purchase_date";

/** Add a property: name, market, what was paid and when. Validated here and again on the server. */
export function AddPropertySheet({ open, markets, onClose, onAdded }: { open: boolean; markets: Market[]; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [today] = useState(() => todayYmd(new Date()));
  const market = markets.find((m) => m.key === form.market_key);

  const set = (k: FieldKey, v: string) => { setForm((f) => ({ ...f, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };
  const close = useEvent(() => { setErrors({}); onClose(); });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const errs = validateProperty(form, today);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await apiFetch("/api/property", { body: { ...form, label: form.label.trim(), purchase_price: Number(form.purchase_price.replace(/[,\s]/g, "")) } });
      invalidate("/api/property");
      toast(`${form.label.trim()} added`);
      setForm({ ...EMPTY_FORM, market_key: form.market_key });
      onAdded();
      close();
    } catch (err) {
      if (err instanceof ApiError && err.isUpgrade) return; // the paywall is already up
      const field = err instanceof ApiError && typeof err.body.field === "string" ? (err.body.field as FieldKey) : null;
      if (field) setErrors({ [field]: err instanceof Error ? err.message : "Check this field." });
      else toast.error(err instanceof Error ? err.message : "Couldn't save that property.");
    } finally { setSaving(false); }
  };

  const err = (k: FieldKey) => errors[k] ? <span className={s.fieldErr} id={`prop-${k}-err`}>{errors[k]}</span> : null;

  return (
    <Sheet open={open} onClose={close} title="Add a property">
      <form className="stack-lg" onSubmit={submit} noValidate>
        <div className="ui-field">
          <label className="ui-label" htmlFor="prop-label">Name</label>
          <input id="prop-label" className="ui-input" placeholder="e.g. Tampines 4-room" maxLength={80} value={form.label}
            aria-invalid={!!errors.label} aria-describedby={errors.label ? "prop-label-err" : undefined}
            onChange={(e) => set("label", e.target.value)} />
          {err("label")}
        </div>
        <div className="ui-field">
          <label className="ui-label" htmlFor="prop-market">Market</label>
          <div className={s.selectWrap}>
            <select id="prop-market" className="ui-select" value={form.market_key} onChange={(e) => set("market_key", e.target.value)}
              aria-invalid={!!errors.market_key}>
              {markets.length === 0 && <option value="sg-hdb">Singapore — HDB resale</option>}
              {markets.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </div>
          {err("market_key")}
          {market && <span className="ui-hint">Valued against {market.source}{market.stats ? "" : " (not available right now)"}.</span>}
        </div>
        <div className={s.formGrid}>
          <div className="ui-field">
            <label className="ui-label" htmlFor="prop-price">Purchase price</label>
            <div className={s.prefixed}>
              <span className={s.prefix} aria-hidden="true">{market?.currency ?? ""}</span>
              <input id="prop-price" className="ui-input" inputMode="numeric" placeholder="612,000" value={form.purchase_price}
                aria-invalid={!!errors.purchase_price} aria-describedby={errors.purchase_price ? "prop-purchase_price-err" : undefined}
                onChange={(e) => set("purchase_price", e.target.value)} />
            </div>
            {err("purchase_price")}
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor="prop-date">Purchase date</label>
            <input id="prop-date" className="ui-input" type="date" max={today} value={form.purchase_date}
              aria-invalid={!!errors.purchase_date} aria-describedby={errors.purchase_date ? "prop-purchase_date-err" : undefined}
              onChange={(e) => set("purchase_date", e.target.value)} />
            {err("purchase_date")}
          </div>
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={saving}>Add property</Button>
        <p className="t-caption">Bacon estimates its value by scaling what you paid by the market index since then. It&apos;s an estimate, not an appraisal.</p>
      </form>
    </Sheet>
  );
}
