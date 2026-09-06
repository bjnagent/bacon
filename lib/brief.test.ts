import { describe, it, expect } from "vitest";
import { buildSignalBundle, type SignalBundle } from "./brief";
import type { Forecast } from "./forecast";

const bundle = (over: Partial<SignalBundle> = {}): string =>
  buildSignalBundle({ movers: [], headlines: [], macro: [], themes: [], tracked: [], ...over });

const fc = (over: Partial<Forecast> = {}): Forecast => ({
  symbol: "NVDA", horizonDays: 21, base: 100, baseDate: "2026-01-01",
  expected: 105, lo: 90, hi: 120, driftAnnualPct: 12.3, volAnnualPct: 41.7, method: "drift", ...over,
});

describe("buildSignalBundle — mechanical price bands", () => {
  it("omits the section entirely when there is nothing to say", () => {
    expect(bundle()).not.toMatch(/MECHANICAL PRICE BANDS/);
    expect(bundle({ forecasts: [] })).not.toMatch(/MECHANICAL PRICE BANDS/);
  });

  it("renders the base, the central case, the band and the inputs behind it", () => {
    const out = bundle({ forecasts: [fc()] });
    expect(out).toMatch(/NVDA: \$100\.00 on 2026-01-01 → 21-session central \$105\.00 \(\+5\.0%\)/);
    expect(out).toMatch(/80% band \$90\.00–\$120\.00/);
    expect(out).toMatch(/drift \+12\.3%\/yr, vol 42%\/yr/);
  });

  // The framing is the safety property. A drift band is what the price does if
  // NOTHING happens; read as a view it is a fabricated forecast with a number
  // attached, which is precisely what this codebase refuses to emit.
  it("labels the band as a mechanical yardstick, not a view", () => {
    const out = bundle({ forecasts: [fc()] });
    expect(out).toMatch(/NOT a view and NOT a recommendation/);
    expect(out).toMatch(/if your target sits INSIDE the band you are forecasting nothing/i);
  });

  // One fixed precision is wrong at one end or the other: bacon covers BTC and
  // sub-dollar names in the same feed, and rounding a $0.42 name to "$0" is the
  // same class of silent corruption as a truncated ticker.
  it("scales precision to the price so no magnitude renders as zero", () => {
    const small = bundle({ forecasts: [fc({ symbol: "PENNY", base: 0.42, expected: 0.45, lo: 0.30, hi: 0.61 })] });
    expect(small).toMatch(/\$0\.420 on/);
    expect(small).not.toMatch(/\$0 on/);
    const large = bundle({ forecasts: [fc({ symbol: "BTC-USD", base: 91234.5, expected: 93000, lo: 71000, hi: 118000 })] });
    expect(large).toMatch(/\$91235 on/);
  });

  it("carries the graded track record through verbatim", () => {
    expect(bundle({ forecastRecord: "FORECAST TRACK RECORD: drift is 12% worse than no change." }))
      .toMatch(/drift is 12% worse than no change\./);
  });
});
