// Pure helpers for the onboarding flow, kept out of the component so they can
// be tested without a browser.

export interface Name { sym: string; cls: string }

// Widely followed names across asset classes — a quick way to start, not a
// suggestion of what to buy (no ranking, no commentary, and the UI says so).
export const STARTERS: Name[] = [
  { sym: "AAPL", cls: "Equity / Stock" },
  { sym: "MSFT", cls: "Equity / Stock" },
  { sym: "NVDA", cls: "Equity / Stock" },
  { sym: "AMZN", cls: "Equity / Stock" },
  { sym: "GOOGL", cls: "Equity / Stock" },
  { sym: "TSLA", cls: "Equity / Stock" },
  { sym: "SPY", cls: "ETF / Fund" },
  { sym: "QQQ", cls: "ETF / Fund" },
  { sym: "GLD", cls: "ETF / Fund" },
  { sym: "BTC-USD", cls: "Crypto" },
];

// Letters/digits plus the suffixes real symbols use: BRK.B, 7203.T, BTC-USD,
// EURUSD=X, ^GSPC. Loose on purpose — the server resolves the symbol properly;
// this only stops obvious typos ("apple inc", "nvda!") becoming tracked rows.
const SYMBOL = /^\^?[A-Z0-9][A-Z0-9.\-=/]{0,19}$/;

/** Upper-cased, space-free symbol, or null if it can't be one. */
export function normaliseSymbol(raw: string): string | null {
  const sym = raw.trim().toUpperCase().replace(/\s+/g, "");
  return SYMBOL.test(sym) ? sym : null;
}

/** Best guess at the asset class from the symbol's shape (the server maps it again). */
export function guessClass(sym: string): string {
  if (sym.endsWith("=X")) return "FX / Currency pair";
  if (/-(USD|USDT|EUR|GBP)$/.test(sym)) return "Crypto";
  return STARTERS.find((n) => n.sym === sym)?.cls ?? "Equity / Stock";
}

const statusOf = (e: unknown): number | null =>
  e && typeof e === "object" && typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : null;

/**
 * POST each item in order. 409 means it's already there (counts as saved); 402
 * means the plan's cap — stop adding and report it; anything else stops with
 * the error so the person can retry.
 */
export async function saveEach<T>(
  items: T[],
  post: (item: T) => Promise<unknown>,
  onSaved: (item: T) => void,
): Promise<{ limit: string | null; error: string | null }> {
  for (const item of items) {
    try {
      await post(item);
      onSaved(item);
    } catch (e) {
      const status = statusOf(e);
      if (status === 409) { onSaved(item); continue; }
      if (status === 402) return { limit: e instanceof Error ? e.message : "You've reached your plan's limit.", error: null };
      return { limit: null, error: e instanceof Error ? e.message : "Something went wrong. Please try again." };
    }
  }
  return { limit: null, error: null };
}
