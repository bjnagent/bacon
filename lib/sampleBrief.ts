// The example brief shown to an account that has never swept.
//
// A new user lands on Today with nothing: the nightly cron hasn't run for them
// (auto-sweep defaults off) so their only route to the product's point is a
// cold 30-second wait staring at a bouncing logo. This shows them the shape of
// a brief first, so the wait is a choice made by someone who already knows what
// they're waiting for.
//
// The companies here are DELIBERATELY generic — "a grid-equipment maker", not a
// ticker. This is a financial product: a fabricated thesis attached to a real
// security reads as a live recommendation no matter how it is labelled, and the
// labelling is doing enough work already. Generic subjects still carry the part
// that matters — that Bacon hunts unglamorous second-order names rather than
// reprinting the megacap everyone already owns.
//
// For the same reason these items carry no `action` and no `target`: the call
// line is where the product commits, and an example must not commit. They also
// carry no hard figures, which keeps `auditFigures` honest — a sample with
// invented percentages would trip the data-check and teach the user to ignore
// it on their real brief.

export interface SampleItem {
  id: string; name: string; ticker: string; cls: string;
  horizon: string; thesis: string; signals: string; checks: string;
}

export const SAMPLE_INTRO =
  "Three places where more than one signal pointed the same way this morning. " +
  "The tape moved, the filings agree, and the macro backdrop isn't fighting it.";

export const SAMPLE_ITEMS: SampleItem[] = [
  {
    id: "sample-1",
    name: "A grid-equipment maker",
    ticker: "—",
    cls: "Equity / Stock",
    horizon: "6–12 months",
    thesis:
      "Everyone is buying the chip designers; far fewer are buying the transformers, switchgear and cabling that a datacentre cannot open without. " +
      "The order books at the equipment end fill before the buildout shows up in anyone's revenue, which is why this end of the trade tends to be cheaper for longer.",
    signals:
      "Utility capex guidance revised up two quarters running · order backlog lengthening while the share price drifts · insiders buying, not selling",
    checks:
      "Confirm: the backlog is new orders, not re-priced old ones · Kill: utilities defer the buildout a year, which turns a backlog into an overhang",
  },
  {
    id: "sample-2",
    name: "An LNG shipping operator",
    ticker: "—",
    cls: "Equity / Stock",
    horizon: "3–6 months",
    thesis:
      "Freight rates are a macro instrument wearing a shipping costume. When the spread between two regions widens far enough to pay for the voyage, " +
      "the ships that carry the cargo get repriced before the cargo does — and the fleet is fixed in the short run, so the rate does all the adjusting.",
    signals:
      "Regional price spread widening past the cost of the voyage · charter rates firming · newbuild deliveries thin into next year",
    checks:
      "Confirm: the spread is holding, not a one-week weather artefact · Kill: the spread closes, or a mild winter empties the arbitrage",
  },
  {
    id: "sample-3",
    name: "A speciality chemicals supplier",
    ticker: "—",
    cls: "Equity / Stock",
    horizon: "12+ months",
    thesis:
      "A quiet compounder attached to a regulated end-market: the customer cannot switch supplier without re-certifying the product, " +
      "so pricing power survives a downturn that the market is currently pricing as if it won't.",
    signals:
      "Margin held through the last destock cycle · multi-year supply agreement renewed · sector trading below its own ten-year average",
    checks:
      "Confirm: the margin held on mix, not on a one-off · Kill: the end-market's regulation changes and re-certification stops being a moat",
  },
];
