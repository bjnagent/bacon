"use client";

import { useEffect, useState } from "react";
import { Search, Newspaper, Radar as RadarIcon, BookOpen, Calculator, LogOut, type LucideIcon } from "lucide-react";
import BaconMark from "./BaconMark";
import AnalyzeView from "./AnalyzeView";
import RadarView from "./RadarView";

type ViewKey = "radar" | "news" | "analyze" | "frameworks" | "sizer";

const NAV: { key: ViewKey; label: string; Icon: LucideIcon }[] = [
  { key: "radar", label: "Radar", Icon: RadarIcon },
  { key: "news", label: "News", Icon: Newspaper },
  { key: "analyze", label: "Analyze", Icon: Search },
  { key: "frameworks", label: "Frameworks", Icon: BookOpen },
  { key: "sizer", label: "Sizer", Icon: Calculator },
];

const PLACEHOLDERS: Record<"news" | "frameworks" | "sizer", { title: string; sub: string }> = {
  news: { title: "News", sub: "Paraphrased, attributed business headlines as signals — never an outlet's exact words. Coming in a later Phase 2 slice." },
  frameworks: { title: "Frameworks — the latticework", sub: "A reference for the six lenses: playbooks, terms, and caveats. A straight static port, coming next." },
  sizer: { title: "Sizer", sub: "Position sizing and fractional-Kelly math on your own inputs — never a specific bet. Coming in a later Phase 2 slice." },
};

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Set state only inside async callbacks (not synchronously in the effect
    // body): avoids a hydration mismatch and React's set-state-in-effect rule.
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
  const activeLabel = NAV.find((n) => n.key === active)!.label;

  const openAnalyze = (t: { asset: string; cls: string }) => {
    setAnalyzeTarget({ ...t, token: Date.now() });
    setActive("analyze");
  };

  return (
    <div className="pr-app">
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
          <div className="pr-railfoot">{userEmail}<br />verify yourself · not advice</div>
        </nav>

        <main className="pr-main">
          <div className="pr-head"><StatusBar module={`MODULE · ${activeLabel}`} /></div>
          <div className="pr-canvas">
            {active === "radar" ? (
              <RadarView onAnalyze={openAnalyze} />
            ) : active === "analyze" ? (
              <AnalyzeView target={analyzeTarget} />
            ) : (
              <div className="pr-placeholder">
                <BaconMark size={64} />
                <div className="pr-placeholder-title">{PLACEHOLDERS[active as keyof typeof PLACEHOLDERS].title}</div>
                <div className="pr-placeholder-sub">{PLACEHOLDERS[active as keyof typeof PLACEHOLDERS].sub}</div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
