// Position-sizing, valuation, and risk math. Pure functions (no I/O, no market
// data) so they're unit-testable — see lib/calc.test.ts. All percentages are
// passed as whole numbers (e.g. 8 for 8%).

export function riskPosition(account: number, riskPct: number, entry: number, stop: number) {
  const riskDollars = account * (riskPct / 100);
  const perUnit = Math.abs(entry - stop);
  const units = perUnit > 0 ? riskDollars / perUnit : 0;
  const posValue = units * entry;
  const posPct = account > 0 ? (posValue / account) * 100 : 0;
  return { riskDollars, perUnit, units, posValue, posPct };
}

// Full Kelly fraction (can be negative → no edge). UI applies half/quarter.
export function kellyFraction(winProbPct: number, payoff: number): number {
  const p = winProbPct / 100, q = 1 - p, b = payoff;
  return b > 0 ? (b * p - q) / b : 0;
}

export interface DcfInput { fcf: number; growthPct: number; termGrowthPct: number; waccPct: number; years: number; netCash: number; shares: number }

export function dcf({ fcf, growthPct, termGrowthPct, waccPct, years, netCash, shares }: DcfInput) {
  const r = waccPct / 100, g = growthPct / 100, tg = termGrowthPct / 100;
  const valid = r > tg && years > 0;
  let pvExplicit = 0, lastF = fcf;
  for (let i = 1; i <= years; i++) { const f = fcf * Math.pow(1 + g, i); pvExplicit += f / Math.pow(1 + r, i); if (i === years) lastF = f; }
  const tv = valid ? (lastF * (1 + tg)) / (r - tg) : 0;
  const pvTv = valid ? tv / Math.pow(1 + r, years) : 0;
  const ev = pvExplicit + pvTv;
  const equity = ev + netCash;
  const perShare = shares > 0 ? equity / shares : 0;
  return { valid, pvExplicit, pvTv, ev, equity, perShare };
}

export function sharpe(retPct: number, rfPct: number, volPct: number): number {
  return volPct > 0 ? (retPct - rfPct) / volPct : 0;
}

// Standard-normal quantile (Acklam's rational approximation).
export function invNorm(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425, ph = 1 - pl;
  let q: number, x: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= ph) { q = p - 0.5; const rr = q * q; x = (((((a[0] * rr + a[1]) * rr + a[2]) * rr + a[3]) * rr + a[4]) * rr + a[5]) * q / (((((b[0] * rr + b[1]) * rr + b[2]) * rr + b[3]) * rr + b[4]) * rr + 1); }
  else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  return x;
}

export function parametricVaR(volPct: number, confPct: number, horizonDays: number, positionValue: number) {
  const z = invNorm(Math.min(Math.max(confPct / 100, 0.5001), 0.9999));
  const dailyVol = (volPct / 100) / Math.sqrt(252);
  const varPct = z * dailyVol * Math.sqrt(Math.max(horizonDays, 1)) * 100;
  return { z, dailyVol, varPct, varDollars: (varPct / 100) * positionValue };
}
