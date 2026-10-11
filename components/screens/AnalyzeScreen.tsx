"use client";

// TEMPORARY bridge — replaced by the reworked Analyze screen.
import "@/app/legacy.css";
import AnalyzeView from "@/components/AnalyzeView";
import { useApp } from "@/components/app/AppContext";

export default function AnalyzeScreen({ active }: { active: boolean }) {
  const app = useApp();
  void active;
  const r = app.analyzeRequest;
  return (
    <div className="pr-app">
      <AnalyzeView target={r ? { asset: r.asset, cls: r.cls, token: r.nonce } : undefined} onDiscuss={(c) => app.openChat(c)} quickSyms={app.watchlist.map((w) => w.symbol)} />
    </div>
  );
}
