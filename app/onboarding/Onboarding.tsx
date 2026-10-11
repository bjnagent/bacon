"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, Check, Plus, X } from "lucide-react";
import BaconMark from "@/components/BaconMark";
import { Button, Callout, Chip, List, Row, Switch } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { SUGGESTED_THEMES } from "@/lib/lenses";
import { track } from "@/lib/track";
import { STARTERS, guessClass, normaliseSymbol, saveEach, type Name } from "./steps";
import s from "./onboarding.module.css";

// Three skippable questions that turn an empty account into one the overnight
// sweep can personalise: themes to hunt, names to watch, how to be reached.
// Each step saves when you leave it, so skipping later loses nothing earlier.

type Notice = { tone: "warn" | "neg"; text: string } | null;

const STEPS = [
  { title: "What do you follow?", sub: "Pick a few themes. Each night the sweep hunts for ideas inside them, alongside the wider market." },
  { title: "Add a few names", sub: "Track the stocks, funds or coins you care about. Bacon re-checks them overnight and flags what changed." },
  { title: "How should we reach you?", sub: "Your brief is ready each morning. Choose whether it also lands in your inbox." },
] as const;

export default function Onboarding({ next }: { next: string }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Once a cap is hit on a step, Continue moves on instead of retrying.
  const [capped, setCapped] = useState<[boolean, boolean]>([false, false]);

  const [themes, setThemes] = useState<string[]>([]);
  const [customTheme, setCustomTheme] = useState("");
  const savedThemes = useRef(new Set<string>());

  const [names, setNames] = useState<Name[]>([]);
  const [ticker, setTicker] = useState("");
  const [tickerErr, setTickerErr] = useState<string | null>(null);
  const savedNames = useRef(new Set<string>());

  const [emailOn, setEmailOn] = useState(true);

  // Move focus to the new step's heading so screen readers announce it and
  // keyboard users start at the top.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  const go = (to: number) => { setNotice(null); setStep(to); window.scrollTo({ top: 0 }); };

  // ---- Step 1: themes ----
  const toggleTheme = (t: string) => setThemes((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));
  const addCustomTheme = (e?: FormEvent) => {
    e?.preventDefault();
    const t = customTheme.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!t) return;
    if (!themes.some((x) => x.toLowerCase() === t.toLowerCase())) setThemes((xs) => [...xs, t]);
    setCustomTheme("");
  };
  const customThemes = themes.filter((t) => !SUGGESTED_THEMES.includes(t));

  // ---- Step 2: names ----
  const toggleName = (n: Name) => setNames((xs) => (xs.some((x) => x.sym === n.sym) ? xs.filter((x) => x.sym !== n.sym) : [...xs, n]));
  const addTicker = (e?: FormEvent) => {
    e?.preventDefault();
    if (!ticker.trim()) return;
    const sym = normaliseSymbol(ticker);
    if (!sym) { setTickerErr("Use the ticker symbol, like AAPL, BRK.B or BTC-USD."); return; }
    if (!names.some((n) => n.sym === sym)) setNames((xs) => [...xs, { sym, cls: guessClass(sym) }]);
    setTicker("");
    setTickerErr(null);
  };
  const typedNames = names.filter((n) => !STARTERS.some((x) => x.sym === n.sym));

  async function saveThemes(): Promise<boolean> {
    const todo = themes.filter((t) => !savedThemes.current.has(t.toLowerCase()));
    const r = await saveEach(todo, (label) => apiFetch("/api/themes", { body: { label }, paywall: false }), (t) => savedThemes.current.add(t.toLowerCase()));
    return settle(0, r, "themes");
  }

  async function saveNames(): Promise<boolean> {
    const todo = names.filter((n) => !savedNames.current.has(n.sym));
    const r = await saveEach(todo, (n) => apiFetch("/api/watchlist", { body: { symbol: n.sym, asset_class: n.cls }, paywall: false }), (n) => savedNames.current.add(n.sym));
    return settle(1, r, "names");
  }

  function settle(i: 0 | 1, r: { limit: string | null; error: string | null }, what: string): boolean {
    if (r.error) { setNotice({ tone: "neg", text: r.error }); return false; }
    if (r.limit) {
      setCapped((c) => (i === 0 ? [true, c[1]] : [c[0], true]));
      setNotice({ tone: "warn", text: `${r.limit} We added the ${what} that fit — upgrade any time for more, or carry on.` });
      return false;
    }
    return true;
  }

  async function onContinue() {
    if (busy) return;
    if ((step === 0 && capped[0]) || (step === 1 && capped[1])) { go(step + 1); return; }
    setBusy(true);
    try {
      const ok = step === 0 ? await saveThemes() : await saveNames();
      if (ok) go(step + 1);
    } finally {
      setBusy(false);
    }
  }

  async function finish(saveEmail: boolean) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (saveEmail) {
        try {
          await apiFetch("/api/settings", { method: "PATCH", body: { brief_email_enabled: emailOn }, paywall: false });
        } catch (e) {
          setNotice({ tone: "neg", text: e instanceof Error ? e.message : "Couldn't save that — try again." });
          setBusy(false);
          return;
        }
      }
      // Marks setup done so the app stops offering it. Older servers answer
      // 400 for an unknown field — harmless, so it's ignored.
      await apiFetch("/api/settings", { method: "PATCH", body: { onboarded_at: true }, paywall: false }).catch(() => undefined);
      track("action", "onboarding", `themes:${savedThemes.current.size} names:${savedNames.current.size} email:${saveEmail ? emailOn : "skip"}`);
      // A full load, not a client transition: the app shell boots fresh with
      // the new watchlist and themes instead of a cache primed before them.
      window.location.assign(next);
    } catch {
      setBusy(false);
    }
  }

  const skip = () => {
    if (step < 2) go(step + 1);
    else void finish(false);
  };

  const meta = STEPS[step];

  return (
    <div className={s.screen}>
      <header className={s.top}>
        <span className={s.brand}><BaconMark size={28} /></span>
        <ol className={s.dots} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <li key={i} className={i === step ? s.dotOn : i < step ? s.dotDone : s.dot} aria-current={i === step ? "step" : undefined} />
          ))}
        </ol>
        <button type="button" className={s.skip} onClick={skip} disabled={busy}>Skip</button>
      </header>

      <main className={s.main}>
        <div key={step} className={s.step}>
          <p className={s.count}>Step {step + 1} of {STEPS.length}</p>
          <h1 ref={headingRef} tabIndex={-1} className={s.title}>{meta.title}</h1>
          <p className={s.sub}>{meta.sub}</p>

          {step === 0 && (
            <div className={s.body}>
              <div className={s.chips} role="group" aria-label="Suggested themes">
                {[...SUGGESTED_THEMES, ...customThemes].map((t) => {
                  const on = themes.includes(t);
                  return (
                    <Chip key={t} pressed={on} onClick={() => toggleTheme(t)} icon={on ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}>
                      {t}
                    </Chip>
                  );
                })}
              </div>
              <form className={s.addRow} onSubmit={addCustomTheme}>
                <label htmlFor="ob-theme" className="sr-only">Add your own theme</label>
                <input
                  id="ob-theme" className={`ui-input ${s.input}`} placeholder="Add your own theme"
                  value={customTheme} onChange={(e) => setCustomTheme(e.target.value)} maxLength={80}
                  autoComplete="off" enterKeyHint="done"
                />
                <Button type="submit" disabled={!customTheme.trim()}>Add</Button>
              </form>
            </div>
          )}

          {step === 1 && (
            <div className={s.body}>
              <form className={s.addRow} onSubmit={addTicker} noValidate>
                <label htmlFor="ob-ticker" className="sr-only">Ticker symbol</label>
                <input
                  id="ob-ticker" className={`ui-input ${s.input} ${s.ticker}`} placeholder="Ticker, e.g. AAPL"
                  value={ticker} onChange={(e) => { setTicker(e.target.value); setTickerErr(null); }} maxLength={20}
                  autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="done"
                  aria-invalid={tickerErr ? true : undefined} aria-describedby={tickerErr ? "ob-ticker-err" : undefined}
                />
                <Button type="submit" disabled={!ticker.trim()}>Add</Button>
              </form>
              {tickerErr && <p id="ob-ticker-err" className={s.fieldError}>{tickerErr}</p>}

              {typedNames.length > 0 && (
                <div className={s.chips} role="group" aria-label="Names you added">
                  {typedNames.map((n) => (
                    <Chip key={n.sym} pressed onClick={() => toggleName(n)} icon={<X aria-hidden="true" />}>
                      <span className="t-mono">{n.sym}</span>
                    </Chip>
                  ))}
                </div>
              )}

              <p className={s.groupLabel}>Common starting points</p>
              <div className={s.chips} role="group" aria-label="Common starting points">
                {STARTERS.map((n) => {
                  const on = names.some((x) => x.sym === n.sym);
                  return (
                    <Chip key={n.sym} pressed={on} onClick={() => toggleName(n)} icon={on ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}>
                      <span className="t-mono">{n.sym}</span>
                    </Chip>
                  );
                })}
              </div>
              <p className="t-caption">A list of widely followed names, not recommendations.</p>
            </div>
          )}

          {step === 2 && (
            <div className={s.body}>
              <List>
                <Row
                  title="Morning brief by email"
                  sub="Your ranked brief in your inbox each morning. Included with Pro and Desk, and during your trial."
                  trailing={<Switch checked={emailOn} onChange={setEmailOn} label="Morning brief by email" />}
                />
              </List>
              <Callout tone="info" icon={<Bell aria-hidden="true" />}>
                <strong>On iPhone?</strong> The Bacon app adds push alerts — when an idea&apos;s kill condition trips, or a
                level you&apos;re watching is reached. You can turn them on from the app.
              </Callout>
              <p className="t-caption">You can change all of this later in Account.</p>
            </div>
          )}

          {notice && <div className={s.notice}><Callout tone={notice.tone}>{notice.text}</Callout></div>}
        </div>
      </main>

      <footer className={s.bar}>
        <div className={s.barInner}>
          {step > 0 && <Button variant="ghost" size="lg" onClick={() => go(step - 1)} disabled={busy}>Back</Button>}
          <Button
            variant="primary" size="lg" className={s.primary} loading={busy}
            onClick={() => (step < 2 ? void onContinue() : void finish(true))}
          >
            {step < 2 ? "Continue" : "Finish"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
