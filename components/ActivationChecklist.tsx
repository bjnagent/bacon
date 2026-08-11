"use client";

import { useEffect, useState } from "react";
import { Check, ArrowRight, X } from "lucide-react";
import { track } from "@/lib/track";
import { SUGGESTED_THEMES } from "@/lib/lenses";
import { cachedJson, invalidate } from "@/lib/clientCache";

export interface ActivationState { swept: boolean; tracked: boolean; analyzed: boolean }

const DISMISS_KEY = "bacon:activation-dismissed";

// The guided first run: sweep → track the top idea → run the lenses on it.
//
// The three steps are the habit loop in miniature, which is why they act on the
// SAME name rather than sending the user off to pick one at each stage. Step
// two and three carry no button until a brief exists — they are genuinely
// blocked on it, and offering a dead control would read as breakage.
//
// Disappears for good once all three are done; the dismiss button is for people
// who would rather not be coached. Dismissal lives in localStorage because it
// is a per-browser UI preference, not account state worth a schema change — the
// worst case is someone dismissing it twice on two devices.
export default function ActivationChecklist({
  state, firstIdea, onSweep, onTrack, onAnalyze,
}: {
  state: ActivationState;
  firstIdea: { sym: string; cls: string } | null;
  onSweep: () => void;
  onTrack: (sym: string, cls: string) => void;
  onAnalyze: (t: { asset: string; cls: string }) => void;
}) {
  // Lazy initializer, as MacroBackdrop does for its collapse preference. Safe
  // for SSR: this only renders once the client has fetched a brief and the
  // activation state, so the server never paints it and there is nothing to
  // mismatch on hydration.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  // Themes personalise the NEXT brief (buildSignalBundle feeds them to the
  // prompt), so the nudge belongs here — after the user has seen what a brief
  // is worth — rather than as a question asked before any value has landed.
  // The chips themselves already exist on Radar; a new user following the
  // first-run flow is on Today and would never find them.
  const [themeCount, setThemeCount] = useState<number | null>(null);
  const [addingTheme, setAddingTheme] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await cachedJson<{ themes?: unknown[] }>("/api/themes", 60_000);
        if (!cancelled) setThemeCount(Array.isArray(d.themes) ? d.themes.length : 0);
      } catch { if (!cancelled) setThemeCount(null); }
    })();
    return () => { cancelled = true; };
  }, []);

  const addTheme = async (label: string) => {
    if (addingTheme) return;
    setAddingTheme(label);
    track("action", "checklist-theme", label);
    try {
      const res = await fetch("/api/themes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }),
      });
      if (res.ok) { invalidate("/api/themes"); setThemeCount((n) => (n ?? 0) + 1); }
    } catch { /* the scout works without themes; a failed add isn't worth an error state */ }
    finally { setAddingTheme(null); }
  };

  const done = state.swept && state.tracked && state.analyzed;
  useEffect(() => {
    if (!dismissed && !done) track("view", "activation-checklist");
  }, [dismissed, done]);

  if (dismissed || done) return null;

  const dismiss = () => {
    track("action", "activation-dismiss");
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* preference is best-effort */ }
  };

  // Checklist actions carry their own event names. Reusing "analyze" here would
  // fold them into the count AppShell already records for the real feature, and
  // "is the checklist working" would become unanswerable from the same number.
  const steps = [
    {
      key: "swept",
      done: state.swept,
      label: "See today's brief",
      hint: "Bacon reads the movers, the filings and the macro backdrop, then writes up where they agree.",
      cta: state.swept ? null : { text: "Sweep now", run: () => { track("action", "checklist-sweep"); onSweep(); } },
    },
    {
      key: "tracked",
      done: state.tracked,
      label: "Track a name",
      hint: "Tracked names get re-checked each sweep, and their calls get graded against SPY on Record.",
      cta: state.tracked || !firstIdea ? null : {
        text: `Track ${firstIdea.sym}`,
        run: () => { track("action", "checklist-track", firstIdea.sym); onTrack(firstIdea.sym, firstIdea.cls); },
      },
    },
    {
      key: "analyzed",
      done: state.analyzed,
      label: "Run the lenses on one",
      hint: "Eight independent reads on a single name — fundamental, valuation, technical, risk and the rest.",
      cta: state.analyzed || !firstIdea ? null : {
        text: `Run lenses on ${firstIdea.sym}`,
        run: () => { track("action", "checklist-analyze", firstIdea.sym); onAnalyze({ asset: firstIdea.sym, cls: firstIdea.cls }); },
      },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  // Only the earliest incomplete step is "next" — labelling all of them that
  // way tells the user nothing about where to go.
  const nextKey = steps.find((s) => !s.done)?.key;

  return (
    <section className="pr-checklist" aria-label="Getting started">
      <div className="pr-checklist-head">
        <span className="pr-checklist-title">Getting started</span>
        <span className="pr-checklist-count">{doneCount} of {steps.length}</span>
        <button className="pr-checklist-x" onClick={dismiss} aria-label="Dismiss getting started">
          <X size={14} />
        </button>
      </div>
      <ol className="pr-checklist-list">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? "is-done" : ""}>
            <span className="pr-checklist-mark" aria-hidden="true">
              {s.done ? <Check size={13} /> : i + 1}
            </span>
            <span className="pr-checklist-body">
              <span className="pr-checklist-label">{s.label}</span>
              <span className="pr-checklist-hint">{s.hint}</span>
            </span>
            {s.cta ? (
              <button className="pr-btn-sm" onClick={s.cta.run}>{s.cta.text} <ArrowRight size={12} /></button>
            ) : (
              <span className="pr-checklist-status">
                {s.done ? "done" : s.key === nextKey ? "next" : "after the brief"}
              </span>
            )}
          </li>
        ))}
      </ol>

      {themeCount === 0 && (
        <div className="pr-checklist-themes">
          <span className="pr-checklist-hint">
            Tomorrow&apos;s brief gets sharper if the scout knows what you care about. Pick a theme or two:
          </span>
          <div className="pr-checklist-chips">
            {SUGGESTED_THEMES.slice(0, 6).map((t) => (
              <button key={t} className="pr-chip" onClick={() => addTheme(t)} disabled={!!addingTheme}>{t}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
