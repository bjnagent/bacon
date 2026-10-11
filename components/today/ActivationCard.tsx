"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button, Chip, IconButton } from "@/components/ui";
import { track } from "@/lib/track";
import { SUGGESTED_THEMES } from "@/lib/lenses";
import { cachedJson, invalidate } from "@/lib/clientCache";
import { apiFetch } from "@/lib/client/api";
import s from "./ActivationCard.module.css";

export interface ActivationState { swept: boolean; tracked: boolean; analyzed: boolean }

const DISMISS_KEY = "bacon:activation-dismissed";

// The guided first run: see the brief → track the top idea → run the lenses on it.
//
// The three steps are the habit loop in miniature, which is why they act on the
// SAME name rather than sending the user off to pick one at each stage. Steps
// two and three carry no button until a brief exists — they are genuinely
// blocked on it, and offering a dead control would read as breakage.
//
// Disappears for good once all three are done; the dismiss button is for people
// who would rather not be coached. Dismissal lives in localStorage because it
// is a per-browser UI preference, not account state worth a schema change — the
// worst case is someone dismissing it twice on two devices.
export default function ActivationCard({
  state, firstIdea, onSweep, onTrack, onAnalyze,
}: {
  state: ActivationState;
  firstIdea: { sym: string; cls: string } | null;
  onSweep: () => void;
  onTrack: (sym: string, cls: string) => void;
  onAnalyze: (t: { asset: string; cls: string }) => void;
}) {
  // Lazy initializer: this only renders once the client has fetched a brief and
  // the activation state, so the server never paints it and there is nothing
  // to mismatch on hydration.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  // Themes personalise the NEXT brief (buildSignalBundle feeds them to the
  // prompt), so the nudge belongs here — after the user has seen what a brief
  // is worth — rather than as a question asked before any value has landed.
  const [themeCount, setThemeCount] = useState<number | null>(null);
  const [addingTheme, setAddingTheme] = useState<string | null>(null);

  const done = state.swept && state.tracked && state.analyzed;
  const hidden = dismissed || done;

  // Gated on `hidden`, not just mounted: hooks run before the early return
  // below, so an ungated fetch here would cost a request on every Today load
  // for everyone who has already dismissed or finished the checklist — the
  // majority of users, forever.
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await cachedJson<{ themes?: unknown[] }>("/api/themes", 60_000);
        if (!cancelled) setThemeCount(Array.isArray(d.themes) ? d.themes.length : 0);
      } catch { if (!cancelled) setThemeCount(null); }
    })();
    return () => { cancelled = true; };
  }, [hidden]);

  useEffect(() => {
    if (!hidden) track("view", "activation-checklist");
  }, [hidden]);

  if (hidden) return null;

  const addTheme = async (label: string) => {
    if (addingTheme) return;
    setAddingTheme(label);
    track("action", "checklist-theme", label);
    try {
      await apiFetch("/api/themes", { body: { label } });
      invalidate("/api/themes");
      setThemeCount((n) => (n ?? 0) + 1);
    } catch { /* the scout works without themes; a failed add isn't worth an error state */ }
    finally { setAddingTheme(null); }
  };

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
      cta: state.swept ? null : { text: "Build brief", run: () => { track("action", "checklist-sweep"); onSweep(); } },
    },
    {
      key: "tracked",
      done: state.tracked,
      label: "Track a name",
      hint: "Tracked names are re-checked each sweep, and their calls are graded against SPY on your record.",
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
        text: `Analyze ${firstIdea.sym}`,
        run: () => { track("action", "checklist-analyze", firstIdea.sym); onAnalyze({ asset: firstIdea.sym, cls: firstIdea.cls }); },
      },
    },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  // Only the earliest incomplete step is "next" — labelling all of them that
  // way tells the user nothing about where to go.
  const nextKey = steps.find((x) => !x.done)?.key;

  return (
    <section className={`ui-card ${s.card}`} aria-label="Getting started">
      <div className={s.head}>
        <div className={s.headText}>
          <span className={s.title}>Getting started</span>
          <span className={s.count}>{doneCount} of {steps.length}</span>
        </div>
        <IconButton label="Dismiss getting started" onClick={dismiss}><X /></IconButton>
      </div>
      <div className={s.progress} aria-hidden="true">
        {steps.map((x) => <span key={x.key} className={x.done ? s.segDone : s.seg} />)}
      </div>
      <ol className={s.steps}>
        {steps.map((x, i) => (
          <li key={x.key} className={x.done ? s.stepDone : s.step}>
            <span className={x.done ? s.markDone : s.mark} aria-hidden="true">
              {x.done ? <Check /> : i + 1}
            </span>
            <span className={s.body}>
              <span className={s.label}>{x.label}{x.done && <span className="sr-only"> (done)</span>}</span>
              {!x.done && <span className={s.hint}>{x.hint}</span>}
            </span>
            {x.cta ? (
              <span className={s.cta}>
                <Button size="sm" variant={x.key === nextKey ? "tonal" : "secondary"} onClick={x.cta.run}>{x.cta.text}</Button>
              </span>
            ) : (
              <span className={s.status}>
                {x.done ? "Done" : x.key === nextKey ? "Next" : "After the brief"}
              </span>
            )}
          </li>
        ))}
      </ol>

      {themeCount === 0 && (
        <div className={s.themes}>
          <p className={s.hint}>
            Tomorrow&apos;s brief gets sharper if Bacon knows what you care about. Pick a theme or two:
          </p>
          <div className={`hscroll ${s.chips}`}>
            {SUGGESTED_THEMES.slice(0, 6).map((t) => (
              <Chip key={t} pressed={addingTheme === t} onClick={() => void addTheme(t)}>{t}</Chip>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
