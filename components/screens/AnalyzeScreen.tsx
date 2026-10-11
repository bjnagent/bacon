"use client";

import { useCallback, useState } from "react";
import { useApp } from "@/components/app/AppContext";
import { paths } from "@/lib/client/routes";
import type { AnalysisListItem } from "@/lib/analysisStore";
import AnalyzeHome from "@/components/analyze/AnalyzeHome";
import AnalysisView from "@/components/analyze/AnalysisView";
import type { OpenRequest } from "@/components/analyze/useAnalysis";
import s from "@/components/analyze/Analyze.module.css";

// /analyze is the search + history home; /analyze/SYM is one analysis.
//
// Both stay mounted. The analysis view is kept (hidden) while the member goes
// back to the list, so a run in progress keeps streaming and finishes into
// history instead of being thrown away. It's keyed by symbol: opening another
// name aborts the old run and starts clean.
//
// The symbol only follows the URL while this tab is on screen — the route is
// global, so on another tab `route.symbol` is empty, and treating that as
// "symbol changed" would abort a run the moment the member looked elsewhere.
export default function AnalyzeScreen({ active }: { active: boolean }) {
  const app = useApp();
  const routeSymbol = app.route.tab === "analyze" ? app.route.symbol ?? null : null;

  const [shown, setShown] = useState<string | null>(routeSymbol);
  const [last, setLast] = useState<string | null>(routeSymbol);
  if (active && routeSymbol !== shown) {
    setShown(routeSymbol);
    if (routeSymbol) setLast(routeSymbol);
  }

  const [open, setOpen] = useState<OpenRequest | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const openItem = useCallback((it: AnalysisListItem) => {
    setOpen({ id: it.id, symbol: it.symbol, nonce: Date.now() });
    app.navigate(paths.analyze(it.symbol));
  }, [app]);

  const back = useCallback(() => app.navigate(paths.analyze()), [app]);

  return (
    <>
      <div className={s.pane} hidden={!!shown}>
        <AnalyzeHome active={active && !shown} version={version} onOpen={openItem} />
      </div>
      {last && (
        <div className={s.pane} hidden={!shown}>
          <AnalysisView
            key={last}
            symbol={last}
            open={open && open.symbol === last ? open : null}
            onBack={back}
            onChanged={bump}
          />
        </div>
      )}
    </>
  );
}
