"use client";

import { createContext, useContext } from "react";
import type { ChatContext } from "@/lib/chatContext";
import type { Feature, Meter } from "@/lib/plans";
import type { PlanState } from "@/lib/entitlements";
import type { AppRoute } from "@/lib/client/routes";

/** GET /api/me */
export interface MeState {
  user: { id: string; email: string | null };
  plan: PlanState;
  limits: Record<Meter, number>;
  features: Feature[];
  watchlistMax: number;
  themesMax: number;
  /** Whole days left on the reverse trial (server-computed), else null. */
  trialDaysLeft: number | null;
}

export interface AnalyzeRequest { asset: string; cls: string; run: boolean; nonce: number }

export interface WatchItem { id: string; symbol: string; asset_class: string }

/**
 * Everything a screen needs from the frame it lives in. Screens never import
 * each other: they ask the shell to navigate, to open Analyze, chat, search or
 * the paywall, and read the account's plan from here.
 */
export interface AppApi {
  route: AppRoute;
  /** Client-side navigation within the app (History API; nothing refetches). */
  navigate: (path: string, opts?: { replace?: boolean }) => void;
  openAnalyze: (t: { asset: string; cls?: string; run?: boolean }) => void;
  analyzeRequest: AnalyzeRequest | null;
  openChat: (ctx?: ChatContext | null) => void;
  openSearch: () => void;

  email: string;
  isAdmin: boolean;

  me: MeState | null;
  refreshMe: () => Promise<void>;
  /** Plan includes a feature. Optimistic (true) until /api/me has loaded. */
  can: (f: Feature) => boolean;
  /** Units of a meter left this month; null when unknown or unmetered. */
  remaining: (m: Meter) => number | null;

  watchlist: WatchItem[];
  watchlistLoaded: boolean;
  /** The last watchlist load failed (so an empty list is not "nothing tracked"). */
  watchlistError: boolean;
  refreshWatchlist: () => Promise<void>;
  isTracked: (symbol: string) => boolean;
  /** Add to the watchlist; resolves true on success. Handles toasts + paywall. */
  trackSymbol: (symbol: string, assetClass?: string) => Promise<boolean>;
  untrackSymbol: (symbol: string) => Promise<boolean>;
}

export const AppCtx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp must be used inside <AppShell>");
  return v;
}
