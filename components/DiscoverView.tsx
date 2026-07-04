"use client";

import { Sunrise, Radar as RadarIcon, Newspaper } from "lucide-react";
import TodayView from "./TodayView";
import RadarView from "./RadarView";
import NewsView from "./NewsView";
import type { ChatContext } from "@/lib/prompts";

export type DiscoverTab = "today" | "radar" | "news";

// The cockpit home: Today (the system's daily opportunity brief) front and
// center, with Radar (your tracked names) and News as the supporting surfaces.
export default function DiscoverView({ tab, setTab, onAnalyze, onDiscuss }: {
  tab: DiscoverTab;
  setTab: (t: DiscoverTab) => void;
  onAnalyze: (t: { asset: string; cls: string }) => void;
  onDiscuss: (c: ChatContext) => void;
}) {
  return (
    <div>
      <div className="pr-seg" role="tablist" aria-label="Cockpit sections">
        <button role="tab" aria-selected={tab === "today"} className={`pr-seg-btn ${tab === "today" ? "is-on" : ""}`} onClick={() => setTab("today")}><Sunrise size={14} /> Today</button>
        <button role="tab" aria-selected={tab === "radar"} className={`pr-seg-btn ${tab === "radar" ? "is-on" : ""}`} onClick={() => setTab("radar")}><RadarIcon size={14} /> Radar</button>
        <button role="tab" aria-selected={tab === "news"} className={`pr-seg-btn ${tab === "news" ? "is-on" : ""}`} onClick={() => setTab("news")}><Newspaper size={14} /> News</button>
      </div>
      {tab === "today" ? <TodayView onAnalyze={onAnalyze} onDiscuss={onDiscuss} />
        : tab === "radar" ? <RadarView onAnalyze={onAnalyze} />
        : <NewsView onAnalyze={onAnalyze} onDiscuss={onDiscuss} />}
    </div>
  );
}
