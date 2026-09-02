// Signal triggers: has a call's own level actually been reached?
//
// Deterministic arithmetic, no model. Comparing a price to a level needs no
// intelligence, and the same rule already governs grading — "no model grades its
// own homework". It is also free, which matters: this is the one part of the
// advice loop that could run continuously, and it costs nothing to do so.
//
// The discipline throughout is that a WRONG trigger is far worse than a missing
// one. A missed entry is an opportunity not taken; a false "stop breached" tells
// someone to sell on a number that was never there. So every step here fails to
// null rather than guessing, and a level that cannot be read confidently simply
// produces no trigger.

export interface Band { lo: number; hi: number }

/**
 * Read the level out of an advice field.
 *
 * The prompt specifies "<the level or band to act in, with its anchor>" — the
 * number first, the reasoning after — so this reads ONLY the leading numeric
 * token(s). That is deliberate and not laziness: the anchors are full of numbers
 * that are not levels ("the 50-day it reclaimed", "~22x the FY27 earnings
 * path"), and a parser that scanned the whole string would happily return 50 or
 * 27 as a stop. Anchored at the start, prose-first input yields null instead.
 */
export function parseLevel(text: string | undefined | null): Band | null {
  if (!text) return null;
  const s = text.trim().replace(/^[~≈]\s*/, "");
  // Optional currency symbol, a number, optionally a dash-separated second one.
  // Thousands-separated form first, so "1,240.50" is not truncated to "1". A
  // comma only counts inside a number when three digits follow it — otherwise
  // the "152," in "152, below the prior low" would be eaten as part of the
  // number and take the following word with it.
  const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
  const m = s.match(new RegExp(String.raw`^\$?\s*(${NUM})(?:\s*[-–—]\s*\$?\s*(${NUM}))?`));
  if (!m) return null;
  // A price level ends the token — what follows is punctuation, a space, or
  // nothing. A letter or a percent sign after it means the number was never a
  // level: it was a MULTIPLE ("22x the FY27 path" → a stop at 22), a PERIOD
  // ("50-day moving average" → 50), or a PERCENTAGE ("12% above the range").
  const rest = s.slice(m[0].length);
  if (/^[A-Za-z%]/.test(rest) || /^[-–—][A-Za-z]/.test(rest)) return null;
  const num = (v: string) => {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const a = num(m[1]);
  if (a == null) return null;
  const b = m[2] != null ? num(m[2]) : null;
  if (b == null) return { lo: a, hi: a };
  return b >= a ? { lo: a, hi: b } : { lo: b, hi: a };
}

export type TriggerKind = "stop" | "target" | "entry";
export interface Trigger { kind: TriggerKind; label: string }

/** Long-side calls versus reducing ones. Anything else returns no direction. */
function side(action: string | undefined): "long" | "reduce" | null {
  const head = (action ?? "").split(/[—–-]/)[0].trim().toLowerCase();
  if (/^(buy|accumulate|hold)/.test(head)) return "long";
  if (/^(sell|trim|avoid)/.test(head)) return "reduce";
  return null;
}

/**
 * The most significant level this price has reached, or null.
 *
 * Ordered by what a person needs to see first: a breached stop outranks a hit
 * target, which outranks an entry coming into range. Only one is returned —
 * a card showing three simultaneous badges communicates less than one showing
 * the one that matters.
 */
export function evaluateTrigger(
  item: { action?: string; entry?: string; stop?: string; target?: string },
  price: number | null | undefined,
): Trigger | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const dir = side(item.action);
  if (!dir) return null;                       // unrecognised call → no claim

  const stop = parseLevel(item.stop);
  if (stop) {
    // A long is stopped out below its level; a reduce-side call is invalidated
    // by the price running away above it.
    const breached = dir === "long" ? price <= stop.hi : price >= stop.lo;
    if (breached) return { kind: "stop", label: dir === "long" ? "stop breached" : "stop breached (above)" };
  }

  const target = parseLevel(item.target);
  if (target) {
    const reached = dir === "long" ? price >= target.lo : price <= target.hi;
    if (reached) return { kind: "target", label: "target reached" };
  }

  const entry = parseLevel(item.entry);
  if (entry && price >= entry.lo && price <= entry.hi) {
    return { kind: "entry", label: "in entry range" };
  }

  return null;
}
