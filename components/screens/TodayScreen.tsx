"use client";

// TEMPORARY bridge — replaced by the reworked Today screen.
import "@/app/legacy.css";
import TodayView from "@/components/TodayView";
import NewsView from "@/components/NewsView";
import { useApp } from "@/components/app/AppContext";

export default function TodayScreen({ active }: { active: boolean }) {
  const app = useApp();
  void active;
  return (
    <div className="pr-app">
      {app.route.sub === "news"
        ? <NewsView onAnalyze={(t) => app.openAnalyze(t)} onDiscuss={(c) => app.openChat(c)} />
        : <TodayView onAnalyze={(t) => app.openAnalyze(t)} onDiscuss={(c) => app.openChat(c)} />}
    </div>
  );
}
