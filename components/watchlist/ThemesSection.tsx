"use client";

import { useState } from "react";
import { Plus, X, Users } from "lucide-react";
import { Section, Chip, Skeleton, Callout, Button, List, Row, toast } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { apiFetch, ApiError, type ApiState } from "@/lib/client/api";
import { invalidate } from "@/lib/clientCache";
import { openPaywall } from "@/lib/client/paywall";
import { paths } from "@/lib/client/routes";
import { SUGGESTED_THEMES } from "@/lib/lenses";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";
import type { ThemeRow } from "@/lib/types";
import s from "./Watchlist.module.css";

export interface SettingsData { settings?: { scout_interval_minutes?: number; last_sweep_at?: string | null; voices?: string | null } }

const splitVoices = (v: string | null | undefined) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);

/**
 * Themes steer the nightly scout and the personal brief. Voices (public
 * commentators the sweep checks as one signal among many) are summarised
 * beside them and edited in Account.
 */
export default function ThemesSection({ themesApi, settingsApi }: {
  themesApi: ApiState<{ themes?: ThemeRow[] }>;
  settingsApi: ApiState<SettingsData>;
}) {
  const app = useApp();
  const [themeInput, setThemeInput] = useState("");

  const themes = themesApi.data?.themes ?? [];
  const me = app.me;
  const unmetered = !me || me.plan.source === "operator" || me.plan.source === "fallback";
  const max = unmetered ? null : me.themesMax;
  const plan: PlanId = me?.plan.plan ?? "free";
  const atCap = max != null && themes.length >= max;
  const suggestions = SUGGESTED_THEMES.filter((t) => !themes.some((x) => x.label.toLowerCase() === t.toLowerCase()));

  const upgrade = () => openPaywall({
    reason: "limit", plan,
    suggested: PLAN_ORDER.find((p) => PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(plan) && PLANS[p].themesMax > PLANS[plan].themesMax) ?? null,
    error: `You're following ${themes.length} of ${max ?? themes.length} themes on ${PLANS[plan].name}.`,
  });

  const addTheme = async (raw: string) => {
    const label = raw.trim().slice(0, 80);
    if (!label) return;
    if (themes.some((t) => t.label.toLowerCase() === label.toLowerCase())) { toast.info(`“${label}” is already a theme`); return; }
    if (atCap) { upgrade(); return; }
    const tmp: ThemeRow = { id: `tmp-${label}`, label, created_at: new Date().toISOString() };
    themesApi.setData((d) => ({ themes: [...(d?.themes ?? []), tmp] }));
    try {
      const r = await apiFetch<{ theme?: ThemeRow }>("/api/themes", { body: { label } });
      themesApi.setData((d) => ({ themes: (d?.themes ?? []).map((t) => (t.id === tmp.id && r.theme ? r.theme : t)) }));
      invalidate("/api/themes");
      invalidate("/api/activation");
    } catch (err) {
      themesApi.setData((d) => ({ themes: (d?.themes ?? []).filter((t) => t.id !== tmp.id) }));
      if (err instanceof ApiError && err.status === 409) { void themesApi.refresh(); return; }
      if (!(err instanceof ApiError && err.isUpgrade)) toast.error(err instanceof Error ? err.message : "Couldn't add that theme.");
    }
  };

  const removeTheme = async (t: ThemeRow) => {
    themesApi.setData((d) => ({ themes: (d?.themes ?? []).filter((x) => x.id !== t.id) }));
    try {
      await apiFetch("/api/themes", { method: "DELETE", body: { id: t.id } });
      invalidate("/api/themes");
    } catch (err) {
      themesApi.setData((d) => ({ themes: [...(d?.themes ?? []), t] }));
      toast.error(err instanceof Error ? err.message : "Couldn't remove that theme.");
    }
  };

  // Voices are edited in Account (one editor, one set of validation rules);
  // here they are a summary and a way in, next to the themes they sit beside
  // in the nightly sweep.
  const voices = splitVoices(settingsApi.data?.settings?.voices);
  const voicesSub = voices.length
    ? `${voices.slice(0, 2).join(", ")}${voices.length > 2 ? ` +${voices.length - 2}` : ""}`
    : "Public analysts or accounts the nightly sweep checks";

  const loading = themesApi.loading && !themesApi.data;

  return (
    <Section
      title="Themes"
      sub={max != null ? `${themes.length} of ${max} · they steer the nightly scout` : "They steer the nightly scout"}
    >
      {loading ? (
        <Skeleton height={36} width="70%" />
      ) : themesApi.error && !themesApi.data ? (
        <Callout tone="neg">
          {themesApi.error.message}
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => void themesApi.refresh()}>Try again</Button></div>
        </Callout>
      ) : (
        <div className="stack">
          <div className={s.chips}>
            {themes.map((t) => (
              <span key={t.id} className={s.tag}>
                {t.label}
                <button type="button" className={s.tagX} aria-label={`Remove theme ${t.label}`} onClick={() => void removeTheme(t)}><X /></button>
              </span>
            ))}
            {atCap ? (
              <Chip onClick={upgrade} icon={<Plus aria-hidden="true" />}>More themes</Chip>
            ) : (
              <input
                className={s.tagInput} placeholder="Add a theme" aria-label="Add a theme" maxLength={80} enterKeyHint="done"
                value={themeInput} onChange={(e) => setThemeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTheme(themeInput); setThemeInput(""); } }}
                onBlur={() => { if (themeInput.trim()) { void addTheme(themeInput); setThemeInput(""); } }}
              />
            )}
          </div>
          {!atCap && suggestions.length > 0 && (
            <div className={s.groupGap}>
              <span className={s.subhead}>{themes.length ? "More ideas" : "Try one"}</span>
              <div className={s.chips}>
                {suggestions.slice(0, themes.length ? 5 : 8).map((t) => (
                  <Chip key={t} icon={<Plus aria-hidden="true" />} onClick={() => void addTheme(t)}>{t}</Chip>
                ))}
              </div>
            </div>
          )}
          {atCap && <p className="t-caption">You&apos;re using all {max} themes on {PLANS[plan].name}. Remove one, or upgrade for more.</p>}
        </div>
      )}

      <List>
        <Row
          icon={<Users />} title="Voices you follow" sub={voicesSub} chevron
          onClick={() => app.navigate(paths.account("voices"))}
        />
      </List>
    </Section>
  );
}
