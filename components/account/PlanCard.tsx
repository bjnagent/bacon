"use client";

import { useState } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button, Callout, Card, UsageMeter, toast } from "@/components/ui";
import type { MeState } from "@/components/app/AppContext";
import { openPaywall } from "@/lib/client/paywall";
import { manageSubscription, restorePurchases } from "@/lib/client/billing";
import { PLAN_ORDER } from "@/lib/plans";
import { formatDay, isUnmetered, meterRows, planActions, planStatus, planTitle, upgradeAdds } from "./plan";
import { useIsNative } from "./useNative";
import s from "./Account.module.css";

export function PlanCardSkeleton() {
  return (
    <Card pad="lg" aria-hidden="true">
      <div className={s.planSkel}>
        <div className="ui-skel" style={{ height: 26, width: "45%" }} />
        <div className="ui-skel" style={{ height: 14, width: "70%" }} />
        <div style={{ height: 8 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className={s.meter}>
            <div className="ui-skel" style={{ height: 12, width: "55%" }} />
            <div className="ui-skel" style={{ height: 6, width: "100%", borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PlanCardError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <Callout tone="neg" icon={<CircleAlert />}>
      <div className="stack-sm">
        <span><strong>Couldn&apos;t load your plan.</strong> Check your connection and try again.</span>
        <div><Button size="sm" variant="secondary" icon={<RotateCcw />} loading={retrying} onClick={onRetry}>Try again</Button></div>
      </div>
    </Callout>
  );
}

export default function PlanCard({ me, refreshMe }: { me: MeState; refreshMe: () => Promise<void> }) {
  const native = useIsNative();
  const [busy, setBusy] = useState<"manage" | "restore" | null>(null);

  const status = planStatus(me);
  const meters = meterRows(me);
  const adds = upgradeAdds(me);
  const actions = planActions(me, native);
  const unmetered = isUnmetered(me);

  const nextPlan = PLAN_ORDER[PLAN_ORDER.indexOf(me.plan.plan) + 1] ?? null;
  const browse = () => openPaywall({ reason: "browse", plan: me.plan.plan, suggested: me.plan.source === "subscription" ? nextPlan : "pro" });

  const manage = async () => {
    setBusy("manage");
    try {
      await manageSubscription(me.plan.provider);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open billing — try again.");
    } finally {
      // The Stripe portal navigates away; Apple's page opens over the app. Either way, settle.
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy("restore");
    try {
      const ok = await restorePurchases(me);
      await refreshMe();
      toast(ok ? "Purchases restored." : "No previous purchases found.", { kind: ok ? "success" : "info" });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't reach the App Store — try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card pad="lg">
      <div className={s.plan}>
        <div className={s.planHead}>
          <div className={s.planName}>{planTitle(me)}</div>
          <div className={`${s.status} ${status.tone !== "neutral" ? s[status.tone] : ""}`} role={status.tone === "neg" ? "alert" : undefined}>
            {status.text}
          </div>
        </div>

        {unmetered ? (
          <div className={s.unmetered}><strong>Unmetered</strong> — no monthly allowances apply.</div>
        ) : (
          <div className={s.meters}>
            {meters.map((m) => {
              const pct = m.limit ? m.used / m.limit : 1;
              const tone = m.left <= 0 ? s.out : pct >= 0.8 ? s.low : "";
              return (
                <div key={m.meter} className={s.meter}>
                  <div className={s.meterTop}>
                    <span className={s.meterLabel}>{m.label}</span>
                    <span className={`${s.meterLeft} ${tone}`}>{m.left <= 0 ? "None left" : `${m.left} left`}</span>
                  </div>
                  <UsageMeter used={m.used} limit={m.limit} />
                </div>
              );
            })}
            <div className={s.resets}>Allowances reset {formatDay(me.plan.resetsAt)}</div>
          </div>
        )}

        {adds && <p className={s.adds}>{adds}</p>}
        {actions.note && <p className={s.note}>{actions.note}</p>}

        {(actions.primary || actions.changePlan || actions.manage || actions.restore) && (
          <div className={s.actions}>
            {actions.primary === "upgrade" && <Button variant="primary" onClick={browse}>{me.plan.source === "trial" ? "Choose a plan" : "Upgrade"}</Button>}
            {actions.primary === "fix_payment" && (
              <Button variant="primary" loading={busy === "manage"} onClick={() => void manage()}>Update payment method</Button>
            )}
            {actions.changePlan && <Button onClick={browse}>Change plan</Button>}
            {actions.manage && (
              <Button loading={busy === "manage"} disabled={busy === "restore"} onClick={() => void manage()}>Manage subscription</Button>
            )}
            {actions.restore && (
              <Button variant="ghost" loading={busy === "restore"} disabled={busy === "manage"} onClick={() => void restore()}>Restore purchases</Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
