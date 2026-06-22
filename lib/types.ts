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

// Columns selected for the watchlist list/detail responses.
export const WATCH_COLUMNS = "id,symbol,asset_class,lean,lean_reason,update_text,watch_text,thesis,conviction,note,status,last_scan_at,created_at";
