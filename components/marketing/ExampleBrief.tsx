import s from "./ExampleBrief.module.css";

// The landing page's "show, don't tell": what a morning brief looks like.
//
// Same rules as the in-app sample a new account sees: the subjects are
// DELIBERATELY generic ("a grid-equipment maker", never a ticker), there are no
// figures, and no idea carries a call, target or action. On a financial product
// a fabricated thesis attached to a real security reads as a live
// recommendation however it is labelled — and it is labelled, twice.

interface ExampleIdea { name: string; horizon: string; thesis: string; signals: string[]; kill: string }

const INTRO = "The few places where more than one signal pointed the same way overnight.";

const IDEAS: ExampleIdea[] = [
  {
    name: "A grid-equipment maker",
    horizon: "6–12 months",
    thesis: "Everyone is buying the chip designers; far fewer are buying the transformers and switchgear a datacentre can't open without. That end of the order book fills before the buildout shows up in anyone's revenue.",
    signals: ["Utility capex guidance raised", "Backlog lengthening", "Insiders buying"],
    kill: "Utilities defer the buildout a year, and the backlog becomes an overhang.",
  },
  {
    name: "An LNG shipping operator",
    horizon: "3–6 months",
    thesis: "When the price gap between two regions pays for the voyage, the ships get repriced before the cargo does. The fleet is fixed in the short run, so charter rates do the adjusting.",
    signals: ["Regional spread past voyage cost", "Charter rates firming", "Few new ships due"],
    kill: "The spread closes, or a mild winter empties the arbitrage.",
  },
  {
    name: "A speciality chemicals supplier",
    horizon: "12+ months",
    thesis: "Customers can't switch supplier without re-certifying the product, so pricing power survives a downturn the market is pricing as if it won't.",
    signals: ["Margin held through the last destock", "Multi-year supply deal renewed"],
    kill: "The end-market's rules change and re-certification stops being a moat.",
  },
];

export function ExampleBrief({ id }: { id?: string }) {
  return (
    <figure className={s.brief} id={id} aria-labelledby="example-brief-title">
      <div className={s.top}>
        <div className={s.titles}>
          <span className={s.title} id="example-brief-title">This morning&apos;s brief</span>
          <span className={s.meta}>Ranked · built overnight</span>
        </div>
        <span className="ui-badge ui-badge--accent">Example</span>
      </div>
      <p className={s.intro}>{INTRO}</p>
      <ol className={s.ideas}>
        {IDEAS.map((it, i) => (
          <li key={it.name} className={s.idea}>
            <div className={s.ideaHead}>
              <span className={s.rank} aria-hidden="true">{i + 1}</span>
              <span className={s.name}>{it.name}</span>
              <span className={s.horizon}>{it.horizon}</span>
            </div>
            <p className={s.thesis}>{it.thesis}</p>
            <ul className={s.signals} aria-label="Signals that agree">
              {it.signals.map((sig) => <li key={sig}>{sig}</li>)}
            </ul>
            <p className={s.kill}><span>Kill if</span> {it.kill}</p>
          </li>
        ))}
      </ol>
      <figcaption className={s.caption}>
        Illustrative example. The subjects are generic on purpose: this is the shape of a brief, not a recommendation.
      </figcaption>
    </figure>
  );
}
