"use client";

import { useEffect } from "react";
import { Badge, Button, Card } from "@/components/ui";
import BaconMark from "@/components/BaconMark";
import { track } from "@/lib/track";
import IdeaCard from "./IdeaCard";
import { SAMPLE_INTRO, SAMPLE_ITEMS } from "./sampleBrief";
import s from "./Today.module.css";

// Shown to an account with no brief at all. `GET /api/brief` returns the latest
// brief with no date filter, so an empty response means "never had one", not
// "none today" — which makes this precisely a first-run surface rather than
// something a returning user sees every morning before the nightly run.
//
// The example is marked in three independent places — the banner, a badge on
// every card, and the dashed frame — because the one thing worse than a blank
// slate on a financial product is a persuasive brief the user thinks is theirs.
// The cards carry no Track or Analyze: acting on an example is never the
// intended next step, and the single CTA says so.
export default function ExampleBrief({ onBuild, now }: { onBuild: () => void; now: number }) {
  useEffect(() => { track("view", "sample-brief"); }, []);

  return (
    <section className={s.example} aria-label="Example brief">
      <Card pad="lg" className={s.exampleIntro}>
        <div className={s.exampleTop}>
          <BaconMark size={40} />
          <Badge tone="info">Example — not your data</Badge>
        </div>
        <h2 className={s.exampleTitle}>This is what a brief looks like</h2>
        <p className={s.exampleBody}>
          Bacon reads the movers, the filings and the macro backdrop, then writes up only the places where more
          than one signal agrees — each with the line that would confirm it and the line that would kill it.
          Below is an illustration; yours is built from today&apos;s real market.
        </p>
        <div>
          {/* No busy state: building unmounts this in favour of the streaming
              view, so the button never lives long enough to spin. */}
          <Button variant="primary" onClick={onBuild}>Build my first brief</Button>
        </div>
      </Card>

      <Card className={`${s.note} ${s.noteExample}`}>
        <div className={s.noteHead}>
          <span className={s.noteTitle}>Desk note</span>
          <Badge tone="info">Example</Badge>
        </div>
        <p className={s.noteText}>{SAMPLE_INTRO}</p>
      </Card>

      <div className="stack">
        {SAMPLE_ITEMS.map((o, i) => <IdeaCard key={o.id} item={o} rank={i + 1} variant="example" now={now} />)}
      </div>

      <p className={s.footnote}>
        An illustration of the format, not a recommendation — the subjects are generic on purpose. Your brief names
        real securities, states its call, and shows the kill condition that would end it. Research, not investment advice.
      </p>
    </section>
  );
}
