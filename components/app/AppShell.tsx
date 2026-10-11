"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sunrise, Bookmark, ScanSearch, History, CircleUser, Search, MessageCircle, Crown } from "lucide-react";
import BaconMark from "@/components/BaconMark";
import CommandPalette, { type PaletteAction } from "@/components/CommandPalette";
import ChatSheet from "@/components/chat/ChatSheet";
import PaywallSheet from "@/components/billing/PaywallSheet";
import TodayScreen from "@/components/screens/TodayScreen";
import WatchlistScreen from "@/components/screens/WatchlistScreen";
import AnalyzeScreen from "@/components/screens/AnalyzeScreen";
import RecordScreen from "@/components/screens/RecordScreen";
import AccountScreen from "@/components/screens/AccountScreen";
import { Toaster, toast } from "@/components/ui";
import { AppCtx, type AppApi, type AnalyzeRequest, type MeState, type WatchItem } from "./AppContext";
import OfflineBanner from "./OfflineBanner";
import { parsePath, paths, TABS, type TabId } from "@/lib/client/routes";
import { apiFetch, ApiError } from "@/lib/client/api";
import { openPaywall } from "@/lib/client/paywall";
import { cachedJson, invalidate } from "@/lib/clientCache";
import { deriveContext, type ChatContext } from "@/lib/prompts";
import { splitSymCls, mapClass } from "@/lib/lenses";
import { track } from "@/lib/track";
import { haptic, hideSplash } from "@/lib/native";
import type { Feature, Meter } from "@/lib/plans";

const TAB_ICON: Record<TabId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  today: Sunrise,
  watchlist: Bookmark,
  analyze: ScanSearch,
  record: History,
  account: CircleUser,
};

const TAB_TITLE: Record<TabId, string> = {
  today: "Today",
  watchlist: "Watchlist",
  analyze: "Analyze",
  record: "Track record",
  account: "Account",
};

function PlanPill({ me, onUpgrade }: { me: MeState | null; onUpgrade: () => void }) {
  if (!me) return null;
  const { plan } = me;
  if (plan.source === "operator" || plan.source === "fallback") return null;
  if (plan.source === "trial" && me.trialDaysLeft != null) {
    const days = me.trialDaysLeft;
    return (
      <button type="button" className="app-plancard" onClick={onUpgrade}>
        <Crown size={16} />
        <span><strong>Pro trial</strong> · {days} day{days === 1 ? "" : "s"} left</span>
      </button>
    );
  }
  if (plan.plan === "free") {
    return (
      <button type="button" className="app-plancard" onClick={onUpgrade}>
        <Crown size={16} />
        <span><strong>Upgrade to Pro</strong> · your own daily brief</span>
      </button>
    );
  }
  return null;
}

export default function AppShell({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const pathname = usePathname() || "/";
  const route = useMemo(() => parsePath(pathname), [pathname]);
  const tab = route.tab;

  // ---- navigation -------------------------------------------------------
  const navigate = useCallback((path: string, opts?: { replace?: boolean }) => {
    if (typeof window === "undefined") return;
    if (path === window.location.pathname + window.location.search) return;
    if (opts?.replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
  }, []);

  // Keep visited tabs mounted; restore each tab's own scroll position.
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set([tab]));
  const scrollByTab = useRef<Partial<Record<TabId, number>>>({});
  const prevTab = useRef<TabId>(tab);
  useLayoutEffect(() => {
    if (prevTab.current === tab) return;
    scrollByTab.current[prevTab.current] = window.scrollY;
    prevTab.current = tab;
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
    window.scrollTo(0, scrollByTab.current[tab] ?? 0);
  }, [tab]);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 36);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const lastPathByTab = useRef<Partial<Record<TabId, string>>>({});
  useEffect(() => { lastPathByTab.current[tab] = pathname; }, [tab, pathname]);

  const goTab = useCallback((id: TabId) => {
    const target = TABS.find((t) => t.id === id)!;
    if (id === tab) {
      // iOS convention: tapping the current tab returns to its top / root.
      haptic("light");
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
      else if (pathname !== target.path && id !== "today") navigate(target.path);
      return;
    }
    haptic("selection");
    // Return to where the user left that tab (e.g. /analyze/NVDA), not its root.
    navigate(lastPathByTab.current[id] ?? target.path);
  }, [tab, pathname, navigate]);

  // ---- account / plan ---------------------------------------------------
  const [me, setMe] = useState<MeState | null>(null);
  const refreshMe = useCallback(async () => {
    invalidate("/api/me");
    try { setMe(await cachedJson<MeState>("/api/me", 60_000)); } catch { /* keep last */ }
  }, []);
  useEffect(() => {
    let live = true;
    cachedJson<MeState>("/api/me", 60_000).then((d) => { if (live && d && "plan" in d) setMe(d); }).catch(() => {});
    return () => { live = false; };
  }, []);
  // A completed checkout returns here with ?upgraded=1 — refresh the plan and say so.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("upgraded")) {
      setTimeout(() => void refreshMe(), 0);
      toast("You're upgraded — welcome aboard.");
      sp.delete("upgraded");
      const q = sp.toString();
      window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
    }
  }, [refreshMe]);

  const can = useCallback((f: Feature) => !me || me.features.includes(f) || me.plan.source === "operator" || me.plan.source === "fallback", [me]);
  const remaining = useCallback((m: Meter) => {
    if (!me || me.plan.source === "operator" || me.plan.source === "fallback") return null;
    return Math.max(0, (me.limits[m] ?? 0) - (me.plan.usage[m] ?? 0));
  }, [me]);

  // ---- watchlist (shared by every screen that can "Track") ---------------
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const refreshWatchlist = useCallback(async () => {
    invalidate("/api/watchlist");
    try {
      const d = await cachedJson<{ items?: WatchItem[] }>("/api/watchlist", 30_000);
      if (Array.isArray(d.items)) setWatchlist(d.items);
    } catch { /* ignore */ } finally { setWatchlistLoaded(true); }
  }, []);
  useEffect(() => {
    let live = true;
    cachedJson<{ items?: WatchItem[] }>("/api/watchlist", 30_000)
      .then((d) => { if (live && Array.isArray(d.items)) setWatchlist(d.items); })
      .catch(() => {})
      .finally(() => { if (live) setWatchlistLoaded(true); });
    return () => { live = false; };
  }, []);
  const isTracked = useCallback((s: string) => watchlist.some((w) => w.symbol.toUpperCase() === s.trim().toUpperCase()), [watchlist]);
  const trackSymbol = useCallback(async (symbol: string, assetClass?: string) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return false;
    if (watchlist.some((w) => w.symbol === sym)) return true;
    const optimistic: WatchItem = { id: `tmp-${sym}`, symbol: sym, asset_class: mapClass(assetClass) };
    setWatchlist((w) => [...w, optimistic]);
    try {
      const d = await apiFetch<{ item?: WatchItem }>("/api/watchlist", { body: { symbol: sym, asset_class: mapClass(assetClass) } });
      setWatchlist((w) => w.map((x) => (x.id === optimistic.id && d.item ? d.item : x)));
      invalidate("/api/watchlist");
      invalidate("/api/activation");
      track("action", "track", sym);
      toast(`${sym} added to your watchlist`, { action: { label: "View", run: () => navigate(paths.watchlist()) } });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return true;
      setWatchlist((w) => w.filter((x) => x.id !== optimistic.id));
      if (!(err instanceof ApiError && err.isUpgrade)) toast.error(err instanceof Error ? err.message : "Couldn't add that — try again.");
      return false;
    }
  }, [watchlist, navigate]);
  const untrackSymbol = useCallback(async (symbol: string) => {
    const sym = symbol.trim().toUpperCase();
    const item = watchlist.find((w) => w.symbol === sym);
    if (!item) return true;
    setWatchlist((w) => w.filter((x) => x.id !== item.id));
    try {
      await apiFetch(`/api/watchlist/${item.id}`, { method: "DELETE" });
      invalidate("/api/watchlist");
      return true;
    } catch {
      setWatchlist((w) => [...w, item]);
      toast.error("Couldn't remove that — try again.");
      return false;
    }
  }, [watchlist]);

  // ---- analyze / chat / search -----------------------------------------
  const [analyzeRequest, setAnalyzeRequest] = useState<AnalyzeRequest | null>(null);
  const openAnalyze = useCallback((t: { asset: string; cls?: string; run?: boolean }) => {
    const asset = t.asset.trim();
    if (!asset) return;
    track("action", "analyze", asset.slice(0, 120));
    setAnalyzeRequest({ asset, cls: mapClass(t.cls), run: t.run ?? true, nonce: Date.now() });
    navigate(paths.analyze(asset));
  }, [navigate]);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const openChat = useCallback((ctx?: ChatContext | null) => {
    track("action", "discuss", ctx?.asset ?? undefined);
    if (ctx) setChatContext(ctx);
    else {
      const view = route.tab === "analyze" ? "analyze" : route.tab === "today" && route.sub === "news" ? "news" : route.tab === "watchlist" ? "radar" : "general";
      setChatContext(deriveContext(view, route.symbol ? { asset: route.symbol } : null, watchlist.map((w) => ({ asset: w.symbol }))));
    }
    setChatOpen(true);
  }, [route, watchlist]);
  const closeChat = useCallback(() => setChatOpen(false), []);

  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSearchOpen(true); return; }
      const t = e.target as HTMLElement;
      const typing = /^(input|textarea|select)$/i.test(t.tagName || "") || t.isContentEditable;
      if (!typing && e.key === "/") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- lifecycle ---------------------------------------------------------
  useEffect(() => { hideSplash(); }, []);
  useEffect(() => { track("view", route.tab === "today" ? (route.sub === "news" ? "news" : "today") : route.tab === "watchlist" ? (route.sub === "property" ? "property" : "watchlist") : route.tab); }, [route.tab, route.sub]);

  const api: AppApi = {
    route, navigate, openAnalyze, analyzeRequest, openChat, openSearch,
    email, isAdmin, me, refreshMe, can, remaining,
    watchlist, watchlistLoaded, refreshWatchlist, isTracked, trackSymbol, untrackSymbol,
  };

  const paletteActions: PaletteAction[] = [
    { id: "today", label: "Today's brief", hint: "Today", run: () => navigate(paths.today()) },
    { id: "news", label: "Headlines", hint: "Today", run: () => navigate(paths.news()) },
    { id: "watchlist", label: "Watchlist", hint: "Watchlist", run: () => navigate(paths.watchlist()) },
    { id: "property", label: "Property tracker", hint: "Watchlist", run: () => navigate(paths.property()) },
    { id: "analyze", label: "Analyze a name", hint: "Analyze", run: () => navigate(paths.analyze()) },
    { id: "record", label: "Track record", hint: "Record", run: () => navigate(paths.record()) },
    { id: "discuss", label: "Ask Bacon", hint: "Chat", run: () => openChat() },
    { id: "plans", label: "Plans & pricing", hint: "Account", run: () => openPaywall({ reason: "browse" }) },
    { id: "account", label: "Account & settings", hint: "Account", run: () => navigate(paths.account()) },
  ];

  const pane = (id: TabId, node: React.ReactNode) =>
    visited.has(id) || id === tab ? (
      <div key={id} className="app-pane" hidden={id !== tab}>{node}</div>
    ) : null;

  const upgrade = () => openPaywall({ reason: "browse" });

  return (
    <AppCtx.Provider value={api}>
      <div className="app">
        <aside className="app-sidebar" aria-label="Primary">
          <Link className="app-brand" href="/" onClick={(e) => { e.preventDefault(); goTab("today"); }}>
            <BaconMark size={30} />
            <span className="app-brand-name">Bacon</span>
          </Link>
          {TABS.map((t) => {
            const Icon = TAB_ICON[t.id];
            return (
              <button key={t.id} type="button" className="app-navitem" aria-current={tab === t.id ? "page" : undefined} onClick={() => goTab(t.id)}>
                <Icon size={19} />{t.label}
              </button>
            );
          })}
          <div style={{ height: 8 }} />
          <button type="button" className="app-navitem" onClick={openSearch}><Search size={19} />Search<kbd>⌘K</kbd></button>
          <button type="button" className="app-navitem" onClick={() => openChat()}><MessageCircle size={19} />Ask Bacon</button>
          <div className="app-sidebar-spacer" />
          <PlanPill me={me} onUpgrade={upgrade} />
          <div className="app-sidebar-foot">Research, not advice. Verify before you act.</div>
        </aside>

        <div className="app-main">
          <header className={`app-topbar${scrolled ? " is-scrolled" : ""}`}>
            <div className="app-topbar-side">
              {tab === "today" && !scrolled ? <BaconMark size={28} /> : null}
            </div>
            <div className="app-topbar-title" aria-hidden={!scrolled}>{route.tab === "analyze" && route.symbol ? route.symbol : TAB_TITLE[tab]}</div>
            <div className="app-topbar-side is-end">
              <button type="button" className="ui-iconbtn" aria-label="Search" onClick={openSearch}><Search /></button>
              <button type="button" className="ui-iconbtn" aria-label="Ask Bacon" onClick={() => openChat()}><MessageCircle /></button>
            </div>
          </header>

          <OfflineBanner />
          <main className="app-content" id="main">
            {pane("today", <TodayScreen active={tab === "today"} />)}
            {pane("watchlist", <WatchlistScreen active={tab === "watchlist"} />)}
            {pane("analyze", <AnalyzeScreen active={tab === "analyze"} />)}
            {pane("record", <RecordScreen active={tab === "record"} />)}
            {pane("account", <AccountScreen active={tab === "account"} />)}
          </main>
        </div>

        <nav className="app-tabbar" aria-label="Primary">
          {TABS.map((t) => {
            const Icon = TAB_ICON[t.id];
            return (
              <button key={t.id} type="button" className="app-tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => goTab(t.id)}>
                <Icon size={24} strokeWidth={tab === t.id ? 2.3 : 1.8} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <CommandPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          actions={paletteActions}
          onAnalyze={(q) => { const { sym, cls } = splitSymCls(q); openAnalyze({ asset: sym, cls, run: true }); }}
        />
        <ChatSheet open={chatOpen} context={chatContext} onClose={closeChat} />
        <PaywallSheet />
        <Toaster />
      </div>
    </AppCtx.Provider>
  );
}
