"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sunrise, Search, Command, History, Radar as RadarIcon, Newspaper, Building2 } from "lucide-react";
import { deriveContext, type ChatContext } from "@/lib/prompts";
import { splitSymCls } from "@/lib/lenses";
import { cachedJson } from "@/lib/clientCache";
import { Boot, HelpOverlay } from "./Terminal";
import BaconMark from "./BaconMark";
import DiscoverView, { type DiscoverTab } from "./DiscoverView";
import AnalyzeView from "./AnalyzeView";
import AccountView from "./AccountView";
import ToolPanel from "./ToolPanel";
import UserMenu from "./UserMenu";
import CommandPalette, { type PaletteAction } from "./CommandPalette";
import ChatPanel, { ChatFab } from "./ChatPanel";

type Place = "discover" | "analyze";
type Tool = null | "account";

// Resolve the timezone label ONCE — Intl.resolvedOptions() is slow and never
// changes within a session, so it must not run inside the 1Hz clock render.
const LOCAL_TZ = (() => {
  try { return (Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL").split("/").pop()!.replace("_", " "); } catch { return "LOCAL"; }
})();

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    const t = setTimeout(() => { setNow(new Date()); id = setInterval(() => setNow(new Date()), 1000); }, 0);
    return () => { clearTimeout(t); clearInterval(id); };
  }, []);
  if (!now) return <span className="pr-clock">--:--:--</span>;
  const p = (n: number) => String(n).padStart(2, "0");
  return <span className="pr-clock">{p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}<em>{LOCAL_TZ}</em></span>;
}

function StatusBar({ module }: { module: string }) {
  return (
    <div className="pr-status">
      <div className="pr-status-mod"><span className="pr-status-live" />{module}</div>
      <div className="pr-status-right">
        <span className="pr-status-tag">CONN ●</span>
        <span className="pr-status-tag">DATA · LIVE WEB</span>
        <span className="pr-status-tag is-warn">NOT ADVICE</span>
        <Clock />
      </div>
    </div>
  );
}

export default function AppShell({ userEmail }: { userEmail: string }) {
  const [place, setPlace] = useState<Place>("discover");
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>("today");
  const [tool, setTool] = useState<Tool>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const [analyzeTarget, setAnalyzeTarget] = useState<{ asset: string; cls: string; token: number } | undefined>(undefined);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [watchlistSyms, setWatchlistSyms] = useState<string[]>([]);

  const finishBoot = useCallback(() => { try { sessionStorage.setItem("bacon_booted", "1"); } catch { /* ignore */ } setBooting(false); }, []);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const closeTool = useCallback(() => setTool(null), []);

  // Boot once per session; load watchlist symbols (palette + chat grounding).
  useEffect(() => {
    const id = setTimeout(() => { try { if (sessionStorage.getItem("bacon_booted")) setBooting(false); } catch { /* ignore */ } }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const d = await cachedJson<{ items?: { symbol: string }[] }>("/api/watchlist", 30_000); if (!cancelled && Array.isArray(d.items)) setWatchlistSyms(d.items.map((it) => it.symbol)); } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const openAnalyze = useCallback((t: { asset: string; cls: string }) => {
    setAnalyzeTarget({ ...t, token: Date.now() });
    setPlace("analyze");
  }, []);

  // Mobile bottom-bar destinations — the real places, one tap each. Setting the
  // discover tab and the place together means "Record" jumps straight there
  // instead of Today→segment→Record.
  const goTab = useCallback((p: Place, t?: DiscoverTab) => { if (t) setDiscoverTab(t); setPlace(p); }, []);
  const MOBILE_TABS: { id: string; label: string; icon: React.ReactNode; active: boolean; go: () => void }[] = [
    { id: "today", label: "Today", icon: <Sunrise size={19} />, active: place === "discover" && discoverTab === "today", go: () => goTab("discover", "today") },
    { id: "record", label: "Record", icon: <History size={19} />, active: place === "discover" && discoverTab === "record", go: () => goTab("discover", "record") },
    { id: "radar", label: "Radar", icon: <RadarIcon size={19} />, active: place === "discover" && discoverTab === "radar", go: () => goTab("discover", "radar") },
    { id: "news", label: "News", icon: <Newspaper size={19} />, active: place === "discover" && discoverTab === "news", go: () => goTab("discover", "news") },
    { id: "property", label: "Property", icon: <Building2 size={19} />, active: place === "discover" && discoverTab === "property", go: () => goTab("discover", "property") },
    { id: "analyze", label: "Analyze", icon: <Search size={19} />, active: place === "analyze", go: () => setPlace("analyze") },
  ];
  const analyzeSym = useCallback((sym: string) => { const { sym: s, cls } = splitSymCls(sym); openAnalyze({ asset: s, cls }); }, [openAnalyze]);

  const openChat = useCallback((ctx?: ChatContext) => {
    if (ctx) { setChatContext(ctx); setChatOpen(true); return; }
    const view = place === "analyze" ? "analyze" : (discoverTab === "news" ? "news" : "radar");
    setChatContext(deriveContext(view, analyzeTarget ?? null, watchlistSyms.map((s) => ({ asset: s }))));
    setChatOpen(true);
  }, [place, discoverTab, analyzeTarget, watchlistSyms]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (booting) return;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setPaletteOpen(true); return; }
      const target = e.target as HTMLElement;
      const tag = (target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
      if (e.key === "Escape") { if (helpOpen) setHelpOpen(false); else if (typing) target.blur(); return; }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); setPaletteOpen(true); return; }
      if (e.key === "?") { e.preventDefault(); setHelpOpen((h) => !h); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booting, helpOpen]);

  const paletteActions: PaletteAction[] = [
    { id: "today", label: "Today — the daily opportunity brief", hint: "cockpit", run: () => { setPlace("discover"); setDiscoverTab("today"); } },
    { id: "record", label: "Track record — how past briefs aged", hint: "cockpit", run: () => { setPlace("discover"); setDiscoverTab("record"); } },
    { id: "radar", label: "Radar — tracking & fresh finds", hint: "cockpit", run: () => { setPlace("discover"); setDiscoverTab("radar"); } },
    { id: "news", label: "News — market headlines", hint: "cockpit", run: () => { setPlace("discover"); setDiscoverTab("news"); } },
    { id: "property", label: "Property — SG & AU market tracker", hint: "cockpit", run: () => { setPlace("discover"); setDiscoverTab("property"); } },
    { id: "analyze", label: "Analyze — multi-lens cockpit", hint: "workspace", run: () => setPlace("analyze") },
    { id: "discuss", label: "Discuss", hint: "contextual chat", run: () => openChat() },
    { id: "account", label: "Account", hint: "password & sign out", run: () => setTool("account") },
    { id: "help", label: "Keyboard & commands", hint: "?", run: () => setHelpOpen(true) },
  ];

  const moduleLabel = place === "analyze" ? "ANALYZE · MULTI-LENS DEEP DIVE" : `COCKPIT · ${discoverTab.toUpperCase()}`;

  return (
    <div className="pr-app">
      <div className="pr-scan" aria-hidden="true" />
      {booting && <Boot onDone={finishBoot} />}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} onAnalyze={analyzeSym} />
      <ToolPanel open={tool === "account"} title="Account" onClose={closeTool}><AccountView email={userEmail} /></ToolPanel>
      <ChatFab onClick={() => openChat()} hidden={chatOpen || booting} />
      <ChatPanel open={chatOpen} context={chatContext} onClose={closeChat} />

      <div className="pr-mobilehead">
        <Link href="/welcome" className="pr-brandlink" aria-label="About Bacon — intro and install">
          <div className="pr-brand">
            <div className="pr-logo"><BaconMark size={24} /></div>
            <div className="pr-brand-text"><div className="pr-brand-name">BACON</div><div className="pr-brand-tag">research radar</div></div>
          </div>
        </Link>
        <div className="pr-mobilehead-actions">
          <button className="pr-iconbtn" aria-label="Search & commands" onClick={() => setPaletteOpen(true)}><Search size={18} /></button>
          <UserMenu email={userEmail} onChangePassword={() => setTool("account")} />
        </div>
      </div>

      {/* Mobile primary navigation — one tap to each destination. */}
      <nav className="pr-tabbar" aria-label="Primary">
        {MOBILE_TABS.map((t) => (
          <button key={t.id} className={`pr-tabbtn ${t.active ? "is-active" : ""}`} aria-current={t.active ? "page" : undefined} onClick={t.go}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="pr-shell">
        <nav className="pr-rail">
          <div className="pr-railbrand">
            <Link href="/welcome" className="pr-brandlink" aria-label="About Bacon — intro and install">
              <div className="pr-brand">
                <div className="pr-logo"><BaconMark size={28} /></div>
                <div className="pr-brand-text"><div className="pr-brand-name">BACON</div><div className="pr-brand-tag">research radar</div></div>
              </div>
            </Link>
          </div>
          <div className="pr-railnav">
            <button className={`pr-railbtn ${place === "discover" ? "is-active" : ""}`} aria-current={place === "discover" ? "page" : undefined} onClick={() => setPlace("discover")}>
              <span className="pr-railidx">01</span><Sunrise size={17} /><span className="lbl">Today</span>
            </button>
            <button className={`pr-railbtn ${place === "analyze" ? "is-active" : ""}`} aria-current={place === "analyze" ? "page" : undefined} onClick={() => setPlace("analyze")}>
              <span className="pr-railidx">02</span><Search size={17} /><span className="lbl">Analyze</span>
            </button>
            <button className="pr-railbtn" onClick={() => setPaletteOpen(true)}><span className="pr-railidx" /><Command size={17} /><span className="lbl">Search</span><kbd className="pr-railkbd">⌘K</kbd></button>
            <div className="pr-railspacer" />
            <UserMenu email={userEmail} onChangePassword={() => setTool("account")} />
          </div>
          <div className="pr-railfoot">Charts via <a className="pr-foot-link" href="https://www.tradingview.com" target="_blank" rel="noopener noreferrer">TradingView</a> · not advice</div>
        </nav>

        <main className="pr-main">
          <div className="pr-head"><StatusBar module={moduleLabel} /></div>
          <div className="pr-canvas">
            {place === "discover"
              ? <DiscoverView tab={discoverTab} setTab={setDiscoverTab} onAnalyze={openAnalyze} onDiscuss={openChat} />
              : <AnalyzeView target={analyzeTarget} onDiscuss={openChat} quickSyms={watchlistSyms} />}
          </div>
        </main>
      </div>
    </div>
  );
}
