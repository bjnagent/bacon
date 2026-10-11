"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Sheet, Segmented, Button, toast } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { onPaywall, type PaywallRequest } from "@/lib/client/paywall";
import { startUpgrade, restorePurchases, type Interval } from "@/lib/client/billing";
import { ApiError } from "@/lib/client/api";
import { isNative } from "@/lib/native";
import { track } from "@/lib/track";
import {
  PLANS, FEATURE_LABEL, METER_LABEL, annualMonthly, annualSavingPct, formatPrice, PLAN_ORDER, type PlanId,
} from "@/lib/plans";
import s from "./Paywall.module.css";

function headline(req: PaywallRequest, current: PlanId): { title: string; body: string } {
  if (req.reason === "feature" && req.feature) {
    const plan = PLANS[req.suggested ?? "pro"].name;
    return { title: `${FEATURE_LABEL[req.feature]} is part of ${plan}`, body: "Upgrade to unlock it, along with everything else below." };
  }
  if (req.reason === "limit" && req.meter) {
    const lbl = METER_LABEL[req.meter];
    const resets = req.resetsAt ? new Date(req.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "next month";
    if (current === "desk") return { title: `You've used this month's ${lbl.many}`, body: `Your allowance resets on ${resets}.` };
    return { title: `You've used this month's ${req.limit ?? ""} ${req.limit === 1 ? lbl.one : lbl.many}`.replace("  ", " "), body: `It resets on ${resets} — or upgrade now for a bigger monthly allowance.` };
  }
  return { title: "Get the full desk", body: "Every plan includes the house brief and the public, graded track record. Paid plans build the brief around you." };
}

export default function PaywallSheet() {
  const app = useApp();
  const [req, setReq] = useState<PaywallRequest | null>(null);
  const [interval, setInterval] = useState<Interval>("year");
  const [busy, setBusy] = useState<PlanId | "restore" | null>(null);

  useEffect(() => onPaywall((r) => { setReq(r); track("view", "paywall", r.feature ?? r.meter ?? r.reason ?? "browse"); }), []);

  const current: PlanId = app.me?.plan.source === "subscription" ? app.me.plan.plan : "free";
  const native = isNative();
  const open = !!req;
  const close = () => { setReq(null); setBusy(null); };

  const choose = async (plan: Exclude<PlanId, "free">) => {
    setBusy(plan);
    track("action", "upgrade-start", `${plan}:${interval}`);
    try {
      const r = await startUpgrade(plan, interval);
      if (r === "purchased") {
        await app.refreshMe();
        toast(`Welcome to ${PLANS[plan].name}.`);
        close();
      } else if (r === "cancelled") {
        setBusy(null);
      }
    } catch (err) {
      setBusy(null);
      toast.error(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't start checkout — try again.");
    }
  };

  const restore = async () => {
    setBusy("restore");
    try {
      const ok = await restorePurchases();
      await app.refreshMe();
      toast(ok ? "Purchases restored." : "No previous purchases found.", { kind: ok ? "success" : "info" });
      if (ok) close();
    } finally { setBusy(null); }
  };

  if (!req) return null;
  const { title, body } = headline(req, current);
  const offer = PLAN_ORDER.filter((p): p is Exclude<PlanId, "free"> => p !== "free");
  const featured: PlanId = req.suggested && req.suggested !== "free" ? req.suggested : "pro";

  return (
    <Sheet open={open} onClose={close} title="Plans" variant="wide">
      <div className={s.intro}>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>

      <div className={s.toggle}>
        <Segmented<Interval>
          label="Billing period"
          value={interval}
          onChange={setInterval}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: <>Yearly<span className={s.save}>−{annualSavingPct("pro")}%</span></> },
          ]}
        />
      </div>

      <div className={s.plans}>
        {offer.map((id) => {
          const p = PLANS[id];
          const isCurrent = current === id;
          const monthly = interval === "year" ? annualMonthly(id) : p.price.monthly;
          return (
            <div key={id} className={`${s.plan} ${id === featured ? s.featured : ""}`}>
              {id === featured && <span className={s.ribbon}>Recommended</span>}
              <div className={s.planHead}>
                <span className={s.planName}>{p.name}</span>
                <span className={s.planTag}>{p.tagline}</span>
              </div>
              <div className={s.price}>
                <span className={s.priceNum}>{formatPrice(monthly)}</span>
                <span className={s.priceUnit}>/ month</span>
              </div>
              <div className={s.priceNote}>
                {interval === "year" ? `${formatPrice(p.price.annual)} billed yearly` : "Billed monthly · cancel anytime"}
              </div>
              <ul className={s.feats}>
                {p.highlights.map((h) => <li key={h}><Check aria-hidden="true" />{h}</li>)}
              </ul>
              {isCurrent
                ? <div className={s.current}>Your current plan</div>
                : <Button variant={id === featured ? "primary" : "secondary"} size="lg" block loading={busy === id} disabled={!!busy && busy !== id} onClick={() => void choose(id)}>
                    {app.me?.plan.source === "trial" && id === "pro" ? "Keep Pro" : `Get ${p.name}`}
                  </Button>}
            </div>
          );
        })}
      </div>

      <p className={s.fine}>
        {native
          ? "Payment is charged to your Apple ID at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period; manage or cancel in your App Store account settings."
          : "Prices in USD, plus applicable tax. Renews automatically; cancel anytime from Account → Plan."}
        {" "}Bacon is a research tool, not investment advice.
      </p>
      <div className={s.links}>
        {native && <button type="button" onClick={() => void restore()} disabled={busy === "restore"}>Restore purchases</button>}
        <a href="/legal/terms" target="_blank" rel="noopener">Terms</a>
        <a href="/legal/privacy" target="_blank" rel="noopener">Privacy</a>
      </div>
    </Sheet>
  );
}
