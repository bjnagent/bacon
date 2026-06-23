"use client";

import { Radar as RadarIcon, Newspaper } from "lucide-react";
import RadarView from "./RadarView";
import NewsView from "./NewsView";
import type { ChatContext } from "@/lib/prompts";

// The home/discovery surface: your Radar dashboard and the News feed in one
// place, switched by a segmented control (controlled by the shell so the command
// palette can jump straight to either).
export default function DiscoverView({ tab, setTab, onAnalyze, onDiscuss }: {
  tab: "radar" | "news";
  setTab: (t: "radar" | "news") => void;
  onAnalyze: (t: { asset: string; cls: string }) => void;
  onDiscuss: (c: ChatContext) => void;
}) {
  return (
    <div>
      <div className="pr-seg" role="tablist" aria-label="Discover sections">
        <button role="tab" aria-selected={tab === "radar"} className={`pr-seg-btn ${tab === "radar" ? "is-on" : ""}`} onClick={() => setTab("radar")}><RadarIcon size={14} /> Radar</button>
        <button role="tab" aria-selected={tab === "news"} className={`pr-seg-btn ${tab === "news" ? "is-on" : ""}`} onClick={() => setTab("news")}><Newspaper size={14} /> News</button>
      </div>
      {tab === "radar" ? <RadarView onAnalyze={onAnalyze} /> : <NewsView onAnalyze={onAnalyze} onDiscuss={onDiscuss} />}
    </div>
  );
}
