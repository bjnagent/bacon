"use client";

// TEMPORARY bridge — replaced by the reworked Watchlist screen.
import "@/app/legacy.css";
import RadarView from "@/components/RadarView";
import PropertyView from "@/components/PropertyView";
import { useApp } from "@/components/app/AppContext";

export default function WatchlistScreen({ active }: { active: boolean }) {
  const app = useApp();
  void active;
  return <div className="pr-app">{app.route.sub === "property" ? <PropertyView /> : <RadarView onAnalyze={(t) => app.openAnalyze(t)} />}</div>;
}
