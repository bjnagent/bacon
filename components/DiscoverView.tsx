"use client";

import { useEffect, useState } from "react";
import { Sunrise, Radar as RadarIcon, Newspaper, History } from "lucide-react";
import TodayView from "./TodayView";
import TrackRecordView from "./TrackRecordView";
import RadarView from "./RadarView";
import NewsView from "./NewsView";
import type { ChatContext } from "@/lib/prompts";

export type DiscoverTab = "today" | "record" | "radar" | "news";

// The cockpit home. Tabs are lazy-mounted on first visit and then KEPT ALIVE
// (display:none) — switching back is instant, state and scroll survive, and
// nothing refetches (the artifact's own proven pattern).
export default function DiscoverView({ tab, setTab, onAnalyze, onDiscuss }: {
  tab: DiscoverTab;
  setTab: (t: DiscoverTab) => void;
  onAnalyze: (t: { asset: string; cls: string }) => void;
  onDiscuss: (c: ChatContext) => void;
}) {
  const [visited, setVisited] = useState<Set<DiscoverTab>>(() => new Set([tab]));
  // Record visits (deferred so setState never runs synchronously in the effect
  // body); the render condition below keeps the active tab mounted regardless.
  useEffect(() => {
    const id = setTimeout(() => setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab))), 0);
    return () => clearTimeout(id);
  }, [tab]);

  const pane = (key: DiscoverTab, node: React.ReactNode) =>
    visited.has(key) || key === tab ? <div style={{ display: tab === key ? "block" : "none" }}>{node}</div> : null;

  return (
    <div>
      <div className="pr-seg" role="tablist" aria-label="Cockpit sections">
        <button role="tab" aria-selected={tab === "today"} className={`pr-seg-btn ${tab === "today" ? "is-on" : ""}`} onClick={() => setTab("today")}><Sunrise size={14} /> Today</button>
        <button role="tab" aria-selected={tab === "record"} className={`pr-seg-btn ${tab === "record" ? "is-on" : ""}`} onClick={() => setTab("record")}><History size={14} /> Record</button>
        <button role="tab" aria-selected={tab === "radar"} className={`pr-seg-btn ${tab === "radar" ? "is-on" : ""}`} onClick={() => setTab("radar")}><RadarIcon size={14} /> Radar</button>
        <button role="tab" aria-selected={tab === "news"} className={`pr-seg-btn ${tab === "news" ? "is-on" : ""}`} onClick={() => setTab("news")}><Newspaper size={14} /> News</button>
      </div>
      {pane("today", <TodayView onAnalyze={onAnalyze} onDiscuss={onDiscuss} />)}
      {pane("record", <TrackRecordView />)}
      {pane("radar", <RadarView onAnalyze={onAnalyze} />)}
      {pane("news", <NewsView onAnalyze={onAnalyze} onDiscuss={onDiscuss} />)}
    </div>
  );
}
