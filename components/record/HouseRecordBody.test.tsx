// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { summarise, type PublicCall } from "@/lib/houseRecord";
import { HouseRecordBody } from "./HouseRecordBody";

// The public record's promises, checked against what actually renders.

const call = (p: Partial<PublicCall>): PublicCall => ({
  instrument: "X", action: "buy", source: "brief", conviction: 3, targetText: null,
  calledAt: "2026-08-01", horizonDate: "2026-11-01",
  actualPct: null, benchPct: null, hit: null, settled: false, ...p,
});

const priced = [
  call({ instrument: "NVDA", calledAt: "2026-08-20", actualPct: 21.4, benchPct: 6.1, hit: true, settled: true }),
  call({ instrument: "XOM", calledAt: "2026-08-12", actualPct: -3.2, benchPct: 2.2, hit: false, settled: true }),
  call({ instrument: "TSLA", action: "avoid", calledAt: "2026-08-05", actualPct: 14, benchPct: 4.1, hit: false, settled: false, horizonDate: "2027-01-09" }),
  call({ instrument: "SG HDB", source: "property", calledAt: "2026-07-30", actualPct: 1.2, benchPct: null, hit: true, settled: true }),
];
const live = call({ instrument: "SECRET", calledAt: "2026-10-08" });
const all = [...priced, live];

afterEach(cleanup);

describe("HouseRecordBody", () => {
  it("lists every priced call, misses included, and offers no outcome filter", () => {
    render(<HouseRecordBody configured summary={summarise(all)} calls={priced} truncated={false} today="2026-10-11" />);
    const list = screen.getByRole("list", { name: /every graded call/i });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(priced.length);
    expect(within(list).getAllByText("Miss")).toHaveLength(2);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("labels an unsettled call as open", () => {
    render(<HouseRecordBody configured summary={summarise(all)} calls={priced} truncated={false} today="2026-10-11" />);
    // The label spans two nodes (the "Open · " prefix is its own span), so match on the element's full text.
    const labelled = screen.getAllByText((_, el) => el?.tagName === "SPAN" && el.textContent === "Open · settles Jan 9" && el.children.length > 0);
    expect(labelled).toHaveLength(1);
  });

  it("never renders a live (unpriced) call, even if one is passed in — it is counted instead", () => {
    render(<HouseRecordBody configured summary={summarise(all)} calls={all} truncated={false} today="2026-10-11" />);
    expect(screen.queryByText("SECRET")).toBeNull();
    expect(screen.getByText(/1 newer call is filed but not graded yet/)).toBeTruthy();
    expect(screen.getByText(/1 too new to show/)).toBeTruthy();
  });

  it("states the SPY comparison on the benchmarked subset only", () => {
    render(<HouseRecordBody configured summary={summarise(all)} calls={priced} truncated={false} today="2026-10-11" />);
    // Three of the four priced calls carry a benchmark; the property call doesn't.
    expect(screen.getByText(/same windows, 3 calls/)).toBeTruthy();
  });

  it("says plainly when the record isn't live, and never shows another account's calls", () => {
    render(<HouseRecordBody configured={false} summary={null} calls={priced} truncated={false} today="2026-10-11" />);
    expect(screen.getByText("The house record isn't live yet")).toBeTruthy();
    expect(screen.queryByText("NVDA")).toBeNull();
  });

  it("explains an empty record instead of showing zeros", () => {
    render(<HouseRecordBody configured summary={summarise([live])} calls={[]} truncated={false} today="2026-10-11" />);
    expect(screen.getByText("Nothing graded yet")).toBeTruthy();
    expect(screen.getByText(/1 call filed and waiting/)).toBeTruthy();
  });
});
