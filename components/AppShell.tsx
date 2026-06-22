"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Search, Newspaper, Radar as RadarIcon, BookOpen, Calculator, LogOut, User, CandlestickChart, type LucideIcon } from "lucide-react";
import { deriveContext, type ChatContext } from "@/lib/prompts";
import { splitSymCls } from "@/lib/lenses";
import { Boot, Console, HelpOverlay, type LogEntry } from "./Terminal";
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
  const [booting, setBooting] = useState(true);
  const [cmd, setCmd] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [helpOpen, setHelpOpen] = useState(false);
  const cmdRef = useRef<HTMLInputElement | null>(null);
  const finishBoot = useCallback(() => setBooting(false), []);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const activeLabel = NAV.find((n) => n.key === active)!.label;

  const openAnalyze = (t: { asset: string; cls: string }) => {
    setAnalyzeTarget({ ...t, token: Date.now() });
    setActive("analyze");
  };

  const openChat = (ctx?: ChatContext) => {
    setChatContext(ctx ?? deriveContext(active, analyzeTarget ?? null, null));
    setChatOpen(true);
  };

  const pushLog = (text: string, kind = "sys") => setLog((l) => [...l, { id: Date.now() + Math.random(), text, kind }].slice(-50));

  const runCommand = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    setHistory((h) => [...h, line]); setHistIdx(-1);
    pushLog("> " + line, "cmd");
    const [verbRaw, ...rest] = line.split(/\s+/);
    const verb = verbRaw.toUpperCase();
    const arg = rest.join(" ").trim();
    const nav: Record<string, ViewKey> = { RADAR: "radar", HOME: "radar", NEWS: "news", ANALYZE: "analyze", ANL: "analyze", MARKETS: "markets", MKT: "markets", FRMK: "frameworks", FRAMEWORKS: "frameworks", FRM: "frameworks", SIZE: "sizer", SIZER: "sizer", SIZ: "sizer", ACCOUNT: "account", ACCT: "account" };
    if (verb === "HELP" || verb === "?") { setHelpOpen(true); return; }
    if (verb === "CLS" || verb === "CLEAR") { setLog([]); return; }
    if (verb === "ASK" || verb === "DISCUSS" || verb === "CHAT") { openChat(); return; }
    if ((verb === "ANL" || verb === "ANALYZE") && arg) { const { sym, cls } = splitSymCls(arg); openAnalyze({ asset: sym, cls }); pushLog("→ analyzing " + sym, "ok"); return; }
    if (verb in nav && !arg) { setActive(nav[verb]); pushLog("→ " + nav[verb], "sys"); return; }
    const { sym, cls } = splitSymCls(line); openAnalyze({ asset: sym, cls }); pushLog("→ analyzing " + sym, "ok");
  };

  const doHistory = (dir: number) => {
    if (!history.length) return;
    let idx = histIdx === -1 ? history.length : histIdx;
    idx = Math.min(Math.max(idx + dir, 0), history.length);
    setHistIdx(idx === history.length ? -1 : idx);
    setCmd(idx === history.length ? "" : history[idx] || "");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (booting) return;
      const target = e.target as HTMLElement;
      const tag = (target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
      if (e.key === "Escape") { if (helpOpen) setHelpOpen(false); else if (typing) target.blur(); return; }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); cmdRef.current?.focus(); return; }
      if (e.key === "?") { e.preventDefault(); setHelpOpen((h) => !h); return; }
      if (/^[1-7]$/.test(e.key)) { const idx = parseInt(e.key, 10) - 1; if (NAV[idx]) setActive(NAV[idx].key); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booting, helpOpen]);

  return (
    <div className="pr-app">
      <div className="pr-scan" aria-hidden="true" />
      {booting && <Boot onDone={finishBoot} />}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
      <ChatFab onClick={() => openChat()} hidden={chatOpen || booting} />
      <ChatPanel open={chatOpen} context={chatContext} onClose={closeChat} />
      <div className="pr-mobilehead">
        <div className="pr-brand">
          <div className="pr-logo"><BaconMark size={26} /></div>
          <div className="pr-brand-text"><div className="pr-brand-name">BACON</div><div className="pr-brand-tag">research radar</div></div>
        </div>
      </div>
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
              <button key={n.key} className={`pr-railbtn ${active === n.key ? "is-active" : ""}`} aria-current={active === n.key ? "page" : undefined} onClick={() => setActive(n.key)}>
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
          <div className="pr-head">
            <StatusBar module={`MODULE · ${activeLabel}`} />
            <Console value={cmd} setValue={setCmd} onRun={runCommand} inputRef={cmdRef} log={log} onHistory={doHistory} />
          </div>
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
