"use client";

import { useState } from "react";
import { Plus, Check, Crown } from "lucide-react";
import { Sheet, Button, Chip, UsageMeter, Callout } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { openPaywall } from "@/lib/client/paywall";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";
import { CLASS_OPTIONS, POPULAR, guessClass, plural } from "./logic";
import { useEvent } from "./useEvent";
import s from "./Watchlist.module.css";

/** Plan usage for the watchlist; null max = unmetered (operator / billing not set up). */
export function useWatchlistCap() {
  const app = useApp();
  const me = app.me;
  const unmetered = !me || me.plan.source === "operator" || me.plan.source === "fallback";
  const max = unmetered ? null : me.watchlistMax;
  const used = app.watchlist.length;
  const plan: PlanId = me?.plan.plan ?? "free";
  const suggested = PLAN_ORDER.find((p) => PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(plan) && PLANS[p].watchlistMax > PLANS[plan].watchlistMax) ?? null;
  const atCap = max != null && used >= max;
  const upgrade = () => openPaywall({
    reason: "limit", plan, suggested,
    error: `You're tracking ${used} of ${max ?? used} ${max === 1 ? "name" : "names"} on ${PLANS[plan].name}.`,
  });
  return { used, max, atCap, plan, upgrade };
}

export default function AddNameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const cap = useWatchlistCap();
  const [sym, setSym] = useState("");
  const [cls, setCls] = useState<string | null>(null); // null = follow the guess
  const [busy, setBusy] = useState(false);

  const clean = sym.trim().toUpperCase();
  const effectiveCls = cls ?? guessClass(clean);
  const already = clean ? app.isTracked(clean) : false;

  const close = useEvent(() => { setSym(""); setCls(null); onClose(); });

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!clean || busy) return;
    if (already) { close(); return; }
    setBusy(true);
    // trackSymbol owns the toast, and a 402 from the server opens the paywall.
    const ok = await app.trackSymbol(clean, effectiveCls);
    setBusy(false);
    if (ok) close();
  };

  return (
    <Sheet open={open} onClose={close} title="Add to watchlist">
      <form className="stack-lg" onSubmit={submit}>
        <div className="ui-field">
          <label className="ui-label" htmlFor="wl-add-sym">Ticker or pair</label>
          <input
            id="wl-add-sym" className="ui-input" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            enterKeyHint="done" placeholder="e.g. NVDA, BTC, EUR/USD" maxLength={40}
            value={sym} onChange={(e) => setSym(e.target.value)}
          />
        </div>

        <div className="ui-field">
          <span className="ui-label" id="wl-add-cls">Asset class</span>
          <div className={s.classPick} role="group" aria-labelledby="wl-add-cls">
            {CLASS_OPTIONS.map((o) => (
              <Chip key={o.value} pressed={effectiveCls === o.value} onClick={() => setCls(o.value)}>{o.label}</Chip>
            ))}
          </div>
        </div>

        {cap.max != null && (
          <div className={s.usage}>
            <div className={s.usageRow}><span>{cap.used} of {plural(cap.max, "name")}</span><span>{PLANS[cap.plan].name}</span></div>
            <UsageMeter used={cap.used} limit={cap.max} />
          </div>
        )}

        {cap.atCap ? (
          <Callout tone="accent" icon={<Crown />}>
            <strong>Your watchlist is full.</strong> You&apos;re tracking {cap.used} of {cap.max} names on {PLANS[cap.plan].name}. Remove one, or upgrade to track more.
            <div style={{ marginTop: 10 }}><Button size="sm" variant="primary" onClick={cap.upgrade}>Upgrade</Button></div>
          </Callout>
        ) : (
          <Button type="submit" variant={already ? "secondary" : "primary"} size="lg" block icon={already ? <Check /> : <Plus />} loading={busy} disabled={!clean || already}>
            {clean ? (already ? "Already on your watchlist" : `Track ${clean}`) : "Track"}
          </Button>
        )}

        <div className="stack-sm">
          <span className="ui-label">Popular</span>
          <div className={s.chips}>
            {POPULAR.map((p) => {
              const on = app.isTracked(p.symbol);
              return (
                <Chip
                  key={p.symbol} pressed={on}
                  icon={on ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                  onClick={() => { if (!on && !cap.atCap) void app.trackSymbol(p.symbol, p.cls); else if (!on) cap.upgrade(); }}
                >
                  {p.symbol}
                </Chip>
              );
            })}
          </div>
          <span className="ui-hint">Bacon re-reads every name you track each night and tells you what changed.</span>
        </div>
      </form>
    </Sheet>
  );
}
