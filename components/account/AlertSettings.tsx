"use client";

import { useRef, type ReactNode } from "react";
import { AtSign, Bell, CircleAlert, Lock, Mail, RotateCcw, ShieldAlert, Sunrise } from "lucide-react";
import { Badge, Button, Callout, List, Row, Switch, toast } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { openPaywall } from "@/lib/client/paywall";
import { invalidate } from "@/lib/clientCache";
import { PLANS, cheapestPlanWith, type Feature } from "@/lib/plans";
import { normalizeSettings, voicesPreview, type Settings, type SettingsPatch } from "./settings";
import { useIsNative } from "./useNative";
import VoicesSheet from "./VoicesSheet";
import s from "./Account.module.css";

type Key = keyof SettingsPatch;

function SkeletonRows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="ui-row has-icon" aria-hidden="true">
          <span className="ui-row-icon" />
          <span className="ui-row-body">
            <span className="ui-skel" style={{ display: "block", height: 14, width: "45%", marginBottom: 6 }} />
            <span className="ui-skel" style={{ display: "block", height: 11, width: "70%" }} />
          </span>
        </div>
      ))}
    </>
  );
}

export default function AlertSettings({ title, voicesOpen, setVoicesOpen }: {
  title: ReactNode;
  voicesOpen: boolean;
  setVoicesOpen: (open: boolean) => void;
}) {
  const app = useApp();
  const native = useIsNative();
  const { data, error, loading, refresh, setData } = useApi<{ settings: Settings }>("/api/settings", 60_000);
  const settings = data?.settings ? normalizeSettings(data.settings as unknown as Record<string, unknown>) : null;

  /**
   * Optimistic writes, per key. Each key remembers the last value the server
   * accepted (`base`) and a sequence number, so a fast on-off-on that fails
   * halfway rolls back to what is actually saved — never to an intermediate
   * tap — and a slow early response can't undo a later one.
   */
  const pending = usePendingWrites();

  const save = async (patch: SettingsPatch, what: string): Promise<boolean> => {
    if (!settings) return false;
    const mine = pending.begin(patch, settings);
    setData((d) => (d ? { settings: { ...d.settings, ...patch } } : d));
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: patch });
      pending.succeed(patch, mine);
      // Today and the brief read the same endpoint through the shared cache.
      invalidate("/api/settings");
      return true;
    } catch (err) {
      const rollback = pending.fail(mine);
      if (Object.keys(rollback).length) setData((d) => (d ? { settings: { ...d.settings, ...rollback } } : d));
      // A 402 has already opened the paywall for the right feature; a toast on top would be noise.
      if (!(err instanceof ApiError && err.isUpgrade)) {
        const msg = err instanceof ApiError && err.code === "offline" ? "You're offline — that change wasn't saved." : `Couldn't save ${what} — try again.`;
        toast.error(msg, { label: "Retry", run: () => void save(patch, what) });
      }
      return false;
    }
  };

  const locked = (feature: Feature) => !app.can(feature);
  const unlock = (feature: Feature) => openPaywall({
    reason: "feature", feature, plan: app.me?.plan?.plan ?? "free", suggested: cheapestPlanWith(feature),
  });
  const lockBadge = (feature: Feature) => (
    <Badge tone="accent"><span className={s.lock}><Lock aria-hidden="true" />{PLANS[cheapestPlanWith(feature)].name}</span></Badge>
  );

  /** A boolean preference row: a switch when the plan includes it, a paywall door when it doesn't. */
  const toggleRow = (o: { feature?: Feature; icon: ReactNode; title: string; sub: ReactNode; checked: boolean; patch: (v: boolean) => SettingsPatch; what: string }) => {
    if (o.feature && locked(o.feature)) {
      const f = o.feature;
      return <Row key={o.title} icon={o.icon} title={o.title} sub={o.sub} trailing={lockBadge(f)} onClick={() => unlock(f)} />;
    }
    return (
      <Row
        key={o.title} icon={o.icon} title={o.title} sub={o.sub}
        trailing={<Switch label={o.title} checked={o.checked} onChange={(v) => void save(o.patch(v), o.what)} />}
      />
    );
  };

  let body: ReactNode;
  if (!settings && error && !loading) {
    body = (
      <div style={{ padding: "var(--s-4)" }}>
        <Callout tone="neg" icon={<CircleAlert />}>
          <div className="stack-sm">
            <span>{error.code === "offline" ? "You're offline — your settings will load when you reconnect." : "Couldn't load your settings."}</span>
            <div><Button size="sm" icon={<RotateCcw />} loading={loading} onClick={() => void refresh()}>Try again</Button></div>
          </div>
        </Callout>
      </div>
    );
  } else if (!settings) {
    body = <SkeletonRows n={5} />;
  } else {
    const briefOn = settings.scout_interval_minutes > 0;
    body = (
      <>
        {toggleRow({
          feature: "personal_brief", icon: <Sunrise />, title: "Daily personal brief",
          sub: "Built overnight from your watchlist and themes",
          checked: briefOn, patch: (v) => ({ scout_interval_minutes: v ? 1440 : 0 }), what: "the daily brief",
        })}
        {toggleRow({
          feature: "kill_watch", icon: <ShieldAlert />, title: "Kill-condition watch",
          sub: "Re-checks each idea's kill condition every day",
          checked: settings.watch_enabled, patch: (v) => ({ watch_enabled: v }), what: "kill-condition watch",
        })}
        {toggleRow({
          feature: "email_brief", icon: <Mail />, title: "Morning email",
          // The email carries the personal brief; without it there is nothing to send.
          sub: briefOn || locked("personal_brief") ? "Your brief in your inbox each morning" : "Turn on the daily brief to get it by email",
          checked: settings.brief_email_enabled, patch: (v) => ({ brief_email_enabled: v }), what: "morning email",
        })}
        {native
          ? toggleRow({
            icon: <Bell />, title: "Push notifications",
            sub: "Your brief, kill-condition alerts and price levels",
            checked: settings.push_enabled, patch: (v) => ({ push_enabled: v }), what: "notifications",
          })
          : <Row icon={<Bell />} title="Notifications" sub="Alerts come by email here, and as push notifications in the iOS app" />}
        {locked("personal_brief")
          ? <Row icon={<AtSign />} title="Tracked voices" sub="X accounts your brief checks for ideas" trailing={lockBadge("personal_brief")} onClick={() => unlock("personal_brief")} />
          : (
            <Row
              icon={<AtSign />} title="Tracked voices" sub="X accounts your brief checks for ideas"
              value={<span className={s.rowValue}>{voicesPreview(settings.voices)}</span>}
              chevron onClick={() => setVoicesOpen(true)}
            />
          )}
      </>
    );
  }

  return (
    <>
      <List title={title}>{body}</List>
      <VoicesSheet
        open={voicesOpen && !!settings}
        initial={settings?.voices ?? ""}
        onClose={() => setVoicesOpen(false)}
        onSave={(voices) => save({ voices }, "your voices")}
      />
    </>
  );
}

// ---------------------------------------------------------------- pending writes

function usePendingWrites() {
  const ref = useRef<Partial<Record<Key, { seq: number; base: unknown }>>>({});
  return {
    begin(patch: SettingsPatch, current: Settings): Partial<Record<Key, number>> {
      const mine: Partial<Record<Key, number>> = {};
      for (const k of Object.keys(patch) as Key[]) {
        const prev = ref.current[k];
        const seq = (prev?.seq ?? 0) + 1;
        ref.current[k] = { seq, base: prev ? prev.base : current[k] };
        mine[k] = seq;
      }
      return mine;
    },
    succeed(patch: SettingsPatch, mine: Partial<Record<Key, number>>) {
      for (const k of Object.keys(mine) as Key[]) {
        const cur = ref.current[k];
        if (!cur) continue;
        if (cur.seq === mine[k]) delete ref.current[k];
        // A later write is still in flight: if it fails, this value is the one to return to.
        else cur.base = patch[k];
      }
    },
    fail(mine: Partial<Record<Key, number>>): SettingsPatch {
      const rollback: Record<string, unknown> = {};
      for (const k of Object.keys(mine) as Key[]) {
        const cur = ref.current[k];
        if (cur && cur.seq === mine[k]) { rollback[k] = cur.base; delete ref.current[k]; }
      }
      return rollback as SettingsPatch;
    },
  };
}
