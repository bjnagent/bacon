// Shared DB row shapes (subset of supabase/schema.sql) used across routes + UI.

export interface WatchRow {
  id: string;
  symbol: string;
  asset_class: string;
  lean: string | null;
  lean_reason: string | null;
  update_text: string | null;
  watch_text: string | null;
  thesis: string;
  conviction: number;
  note: string;
  status: string; // pending | ok | error
  last_scan_at: string | null;
  created_at: string;
}

export interface ThemeRow {
  id: string;
  label: string;
  created_at: string;
}

export interface ScoutPickRow {
  id: string;
  name: string;
  symbol: string;
  asset_class: string;
  why: string;
  now_catalyst: string;
  check_text: string;
  action: string | null;  // Buy | Accumulate | Watch — why now
  target: string | null;  // 12-mo estimate (est.)
  change_pct: string | null;
  data_source: string | null;
  kind: string; // theme | mover | opportunity | brief-intro
  created_at: string;
}

export const SCOUT_PICK_COLUMNS = "id,name,symbol,asset_class,why,now_catalyst,check_text,action,target,change_pct,data_source,kind,created_at";

export interface NewsItemRow {
  id: string;
  headline: string;
  source: string;
  why: string;
  symbol: string;
  asset_class: string;
  signal: string;
  recency: string;
  created_at: string;
}

export const NEWS_COLUMNS = "id,headline,source,why,symbol,asset_class,signal,recency,created_at";

// per-user settings (subset)
export interface SettingsRow {
  scout_interval_minutes: number;
  last_sweep_at: string | null;
}

// Columns selected for the watchlist list/detail responses.
export const WATCH_COLUMNS = "id,symbol,asset_class,lean,lean_reason,update_text,watch_text,thesis,conviction,note,status,last_scan_at,created_at";
