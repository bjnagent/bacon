"use client";

import { useEffect, useState } from "react";
import { Search, Newspaper, Radar as RadarIcon, BookOpen, Calculator, LogOut, User, CandlestickChart, type LucideIcon } from "lucide-react";
import { deriveContext, type ChatContext } from "@/lib/prompts";
import BaconMark from "./BaconMark";
import AnalyzeView from "./AnalyzeView";
import RadarView from "./RadarView";
import AccountView from "./AccountView";
import MarketsView from "./MarketsView";
import NewsView from "./NewsView";
import FrameworksView from "./FrameworksView";
import SizerView from "./SizerView";
import ChatPanel, { ChatFab } from "./ChatPanel";

type ViewKey = "radar" | "news" | "analyze" | "markets" | "frameworks" | "sizer" | "account";

const NAV: { key: ViewKey; label: string; Icon: LucideIcon }[] = [
  { key: "radar", label: "Radar", Icon: RadarIcon },
  { key: "news", label: "News", Icon: Newspaper },
  { key: "analyze", label: "Analyze", Icon: Search },
  { key: "markets", label: "Markets", Icon: CandlestickChart },
  { key: "frameworks", label: "Frameworks", Icon: BookOpen },
  { key: "sizer", label: "Sizer", Icon: Calculator },
  { key: "account", label: "Account", Icon: User },
];

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    const t = setTimeout(() => {
      setNow(new Date());
      id = setInterval(() => setNow(new Date()), 1000);
    }, 0);
    return () => { clearTimeout(t); clearInterval(id); };
  }, []);
  if (!now) return <span className="pr-clock">--:--:--</span>;
  const p = (n: number) => String(n).padStart(2, "0");
  let tz = "LOCAL";
  try { tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL").split("/").pop()!.replace("_", " "); } catch { /* ignore */ }
  return <span className="pr-clock">{p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}<em>{tz}</em></span>;
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
  const [active, setActive] = useState<ViewKey>("radar");
  const [analyzeTarget, setAnalyzeTarget] = useState<{ asset: string; cls: string; token: number } | undefined>(undefined);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const activeLabel = NAV.find((n) => n.key === active)!.label;

  const openAnalyze = (t: { asset: string; cls: string }) => {
    setAnalyzeTarget({ ...t, token: Date.now() });
    setActive("analyze");
  };

  const openChat = (ctx?: ChatContext) => {
    setChatContext(ctx ?? deriveContext(active, analyzeTarget ?? null, null));
    setChatOpen(true);
  };

  return (
    <div className="pr-app">
      <ChatFab onClick={() => openChat()} hidden={chatOpen} />
      <ChatPanel open={chatOpen} context={chatContext} onClose={() => setChatOpen(false)} />
      <div className="pr-shell">
        <nav className="pr-rail">
          <div className="pr-railbrand">
            <div className="pr-brand">
              <div className="pr-logo"><BaconMark size={28} /></div>
              <div className="pr-brand-text">
                <div className="pr-brand-name">BACON</div>
                <div className="pr-brand-tag">research radar</div>
              </div>
            </div>
          </div>
          <div className="pr-railnav">
            {NAV.map((n, i) => (
              <button key={n.key} className={`pr-railbtn ${active === n.key ? "is-active" : ""}`} onClick={() => setActive(n.key)}>
                <span className="pr-railidx">{String(i + 1).padStart(2, "0")}</span>
                <n.Icon size={17} />
                <span className="lbl">{n.label}</span>
              </button>
            ))}
            <form action="/api/auth/signout" method="post" className="pr-railsignout">
              <button type="submit" className="pr-railbtn"><span className="pr-railidx" /><LogOut size={17} /><span className="lbl">Sign out</span></button>
            </form>
          </div>
          <div className="pr-railfoot">{userEmail}<br />Charts via <a className="pr-foot-link" href="https://www.tradingview.com" target="_blank" rel="noopener noreferrer">TradingView</a> · not advice</div>
        </nav>

        <main className="pr-main">
          <div className="pr-head"><StatusBar module={`MODULE · ${activeLabel}`} /></div>
          <div className="pr-canvas">
            {active === "radar" ? <RadarView onAnalyze={openAnalyze} />
              : active === "news" ? <NewsView onAnalyze={openAnalyze} onDiscuss={openChat} />
              : active === "analyze" ? <AnalyzeView target={analyzeTarget} onDiscuss={openChat} />
              : active === "markets" ? <MarketsView onAnalyze={openAnalyze} />
              : active === "frameworks" ? <FrameworksView />
              : active === "sizer" ? <SizerView />
              : <AccountView email={userEmail} />}
          </div>
        </main>
      </div>
    </div>
  );
}
