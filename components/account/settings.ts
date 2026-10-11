// The `settings` row: its shape, its defaults, and the validation every write
// goes through. Pure and dependency-free so the API route (server) and the
// Account tab (client) share one definition, and so it can be unit-tested.

import type { Feature } from "@/lib/plans";

export interface Settings {
  /** 0 = off; 1440 = once per nightly run. */
  scout_interval_minutes: number;
  last_sweep_at: string | null;
  news_source: string;
  news_focus: string;
  brief_email_enabled: boolean;
  watch_enabled: boolean;
  /** Comma-separated, e.g. "@elerianm, @LynAldenContact". */
  voices: string;
  push_enabled: boolean;
  /** IANA zone, e.g. "Asia/Singapore". */
  timezone: string | null;
  onboarded_at: string | null;
  updated_at: string | null;
}

/** Explicit column list for reads — never `*`, so a new column can't leak to the client by accident. */
export const SETTINGS_COLUMNS =
  "scout_interval_minutes,last_sweep_at,news_source,news_focus,brief_email_enabled,watch_enabled,voices,push_enabled,timezone,onboarded_at,updated_at";

/**
 * What GET answers when the account has no row. Mostly the column defaults in
 * supabase/schema.sql — except the daily brief, which reads as OFF: the
 * nightly sweep only visits accounts that HAVE a row, so showing "on" here
 * would promise a brief that never comes. Saving any setting creates the row.
 */
export const SETTINGS_DEFAULTS: Settings = {
  scout_interval_minutes: 0,
  last_sweep_at: null,
  news_source: "All",
  news_focus: "",
  brief_email_enabled: false,
  watch_enabled: false,
  voices: "",
  push_enabled: true,
  timezone: null,
  onboarded_at: null,
  updated_at: null,
};

/** Fill gaps (missing row, older schema, NULLs) with defaults and coerce types. */
export function normalizeSettings(row: Record<string, unknown> | null | undefined): Settings {
  const r = row ?? {};
  const bool = (k: keyof Settings) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (SETTINGS_DEFAULTS[k] as boolean));
  const text = (k: keyof Settings) => (typeof r[k] === "string" ? (r[k] as string) : (SETTINGS_DEFAULTS[k] as string));
  const nullableText = (k: keyof Settings) => (typeof r[k] === "string" && r[k] ? (r[k] as string) : null);
  return {
    // NULL reads as off for the same reason: the sweep's `> 0` filter skips it.
    scout_interval_minutes: typeof r.scout_interval_minutes === "number" && Number.isFinite(r.scout_interval_minutes)
      ? r.scout_interval_minutes : SETTINGS_DEFAULTS.scout_interval_minutes,
    last_sweep_at: nullableText("last_sweep_at"),
    news_source: text("news_source"),
    news_focus: text("news_focus"),
    brief_email_enabled: bool("brief_email_enabled"),
    watch_enabled: bool("watch_enabled"),
    voices: text("voices"),
    push_enabled: bool("push_enabled"),
    timezone: nullableText("timezone"),
    onboarded_at: nullableText("onboarded_at"),
    updated_at: nullableText("updated_at"),
  };
}

// ---------------------------------------------------------------- voices

/** The brief prompt reads at most this many (lib/brief splitVoices). */
export const MAX_VOICES = 8;
const MAX_VOICE_LEN = 40;
const HANDLE = /^@?[A-Za-z0-9_]{1,15}$/;

/**
 * Parse what someone typed into the voices box: commas or new lines between
 * entries, "@" optional. Bare X handles get their "@"; anything else that
 * isn't a handle (a name typed on the old Radar screen, say) is kept as
 * written so nobody's list is silently rewritten. Duplicates collapse.
 */
export function parseVoices(raw: string): { voices: string[]; error: string | null } {
  const seen = new Set<string>();
  const voices: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    // Strip control characters and squeeze runs of whitespace before judging length.
    const v = part.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
    if (!v || v === "@") continue;
    if (v.length > MAX_VOICE_LEN) return { voices: [], error: `“${v.slice(0, 24)}…” is too long — use the X handle, like @elerianm.` };
    const label = HANDLE.test(v) ? `@${v.replace(/^@/, "")}` : v;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    voices.push(label);
  }
  if (voices.length > MAX_VOICES) {
    const over = voices.length - MAX_VOICES;
    return { voices: [], error: `Up to ${MAX_VOICES} voices — remove ${over} to save.` };
  }
  return { voices, error: null };
}

export function formatVoices(list: string[]): string {
  return list.join(", ");
}

/** Short preview for the settings row: "@a, @b +3", or "None". */
export function voicesPreview(raw: string, maxShown = 2): string {
  const list = raw.split(",").map((v) => v.trim()).filter(Boolean);
  if (!list.length) return "None";
  const shown = list.slice(0, maxShown).join(", ");
  return list.length > maxShown ? `${shown} +${list.length - maxShown}` : shown;
}

// ---------------------------------------------------------------- writes

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Turning one of these ON needs the plan feature; turning it off never does. */
export const PAID_TOGGLES = {
  scout_interval_minutes: "personal_brief",
  watch_enabled: "kill_watch",
  brief_email_enabled: "email_brief",
} as const satisfies Partial<Record<keyof Settings, Feature>>;

export type SettingsPatch = Partial<Omit<Settings, "last_sweep_at" | "updated_at">>;

export type PatchResult =
  | { ok: true; patch: SettingsPatch; enabling: Feature[] }
  | { ok: false; error: string };

/** A week: anything longer isn't a cadence the sweep supports. */
const MAX_INTERVAL = 7 * 24 * 60;

/**
 * Validate a PATCH body into a column patch. Unknown keys are ignored (older
 * clients send extras); a known key with the wrong type is a 400, never a
 * silent coercion. `enabling` lists the paid features this patch switches on.
 */
export function parseSettingsPatch(body: Record<string, unknown>, now: Date = new Date()): PatchResult {
  const patch: SettingsPatch = {};
  const bad = (error: string): PatchResult => ({ ok: false, error });

  if ("scout_interval_minutes" in body) {
    const v = body.scout_interval_minutes;
    if (typeof v !== "number" || !Number.isFinite(v)) return bad("scout_interval_minutes must be a number of minutes.");
    patch.scout_interval_minutes = Math.min(MAX_INTERVAL, Math.max(0, Math.round(v)));
  }
  for (const k of ["brief_email_enabled", "watch_enabled", "push_enabled"] as const) {
    if (!(k in body)) continue;
    if (typeof body[k] !== "boolean") return bad(`${k} must be true or false.`);
    patch[k] = body[k] as boolean;
  }
  if ("voices" in body) {
    if (typeof body.voices !== "string" || body.voices.length > 400) return bad("voices must be a comma-separated list under 400 characters.");
    const parsed = parseVoices(body.voices);
    if (parsed.error) return bad(parsed.error);
    patch.voices = formatVoices(parsed.voices);
  }
  if ("news_source" in body) {
    if (typeof body.news_source !== "string" || body.news_source.length > 40) return bad("news_source must be a short string.");
    patch.news_source = body.news_source.trim() || "All";
  }
  if ("news_focus" in body) {
    if (typeof body.news_focus !== "string" || body.news_focus.length > 200) return bad("news_focus must be under 200 characters.");
    patch.news_focus = body.news_focus.trim();
  }
  if ("timezone" in body) {
    const tz = body.timezone;
    if (tz === null) patch.timezone = null;
    else if (typeof tz !== "string" || !isValidTimeZone(tz.trim())) return bad("timezone must be an IANA time zone, like Europe/London.");
    else patch.timezone = tz.trim();
  }
  if ("onboarded_at" in body) {
    // A flag, not a timestamp: the server's clock decides when onboarding finished.
    if (body.onboarded_at !== true) return bad("onboarded_at only accepts true.");
    patch.onboarded_at = now.toISOString();
  }

  if (Object.keys(patch).length === 0) return bad("Nothing to update.");

  const enabling: Feature[] = [];
  if ((patch.scout_interval_minutes ?? 0) > 0) enabling.push(PAID_TOGGLES.scout_interval_minutes);
  if (patch.watch_enabled === true) enabling.push(PAID_TOGGLES.watch_enabled);
  if (patch.brief_email_enabled === true) enabling.push(PAID_TOGGLES.brief_email_enabled);
  return { ok: true, patch, enabling };
}
