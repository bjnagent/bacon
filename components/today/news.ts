// Pure helpers for the Headlines pane.

import { ago, type Tone } from "./brief";

/** GET /api/news rows (the shape persisted by replace_news). */
export interface NewsRow {
  id?: string; headline: string; source: string; why: string; symbol: string;
  asset_class: string; signal: string; recency: string; created_at?: string;
}

/** POST /api/news → `result.items` (the parser's shape). */
export interface NewsParsed { head: string; source: string; why: string; ticker: string; cls: string; signal: string; when: string }

export interface Headline {
  key: string; head: string; source: string; why: string; ticker: string; cls: string;
  signal: string; when: string; createdAt: string | null;
}

export function fromRow(r: NewsRow, i: number): Headline {
  return {
    key: r.id ?? `row-${i}`, head: r.headline, source: r.source, why: r.why, ticker: r.symbol,
    cls: r.asset_class, signal: r.signal, when: r.recency, createdAt: r.created_at ?? null,
  };
}

export function fromParsed(n: NewsParsed, i: number, createdAt: string): Headline {
  return {
    key: `fresh-${i}-${n.head.slice(0, 24)}`, head: n.head, source: n.source, why: n.why, ticker: n.ticker,
    cls: n.cls, signal: n.signal, when: n.when, createdAt,
  };
}

export type Lean = "constructive" | "cautious";

/**
 * Which way a headline leans, read from its signal tag. The news prompt tags
 * items by TYPE (Earnings, Upgrade, Macro…), and only some of those carry a
 * direction; the rest lean nowhere and are honestly left unclassified rather
 * than guessed into a bucket.
 */
export function signalLean(signal: string | undefined | null): Lean | null {
  const s = (signal ?? "").toLowerCase();
  if (!s) return null;
  // Deliberately narrow: "cut" or "raise" alone could be a rate cut (welcome)
  // or a guidance cut (not), and a wrong lean is worse than none.
  if (/cautio|bear|negativ|downgrade/.test(s)) return "cautious";
  if (/construct|bull|positiv|upgrade/.test(s)) return "constructive";
  return null;
}

export function leanTone(signal: string | undefined | null): Tone {
  const l = signalLean(signal);
  return l === "constructive" ? "pos" : l === "cautious" ? "neg" : "neutral";
}

/** Sentence-case a tag for display ("constructive" → "Constructive", "M&A" stays). */
export function tagLabel(signal: string): string {
  const s = signal.trim();
  if (!s || s === "—") return "";
  return /[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s;
}

export type NewsFilter = "all" | Lean | `tag:${string}`;

/**
 * The filter chips for a batch: All · Constructive · Cautious, then any
 * directionless tags present (Earnings, Macro…), so a batch tagged only by type
 * still has something useful to filter on.
 */
export function newsFilters(items: Headline[]): { id: NewsFilter; label: string; count: number }[] {
  const out: { id: NewsFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: items.length },
    { id: "constructive", label: "Constructive", count: items.filter((n) => signalLean(n.signal) === "constructive").length },
    { id: "cautious", label: "Cautious", count: items.filter((n) => signalLean(n.signal) === "cautious").length },
  ];
  const tags = new Map<string, number>();
  for (const n of items) {
    const t = tagLabel(n.signal);
    if (!t || signalLean(n.signal)) continue;
    tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  for (const [t, count] of tags) out.push({ id: `tag:${t}`, label: t, count });
  return out;
}

export function matchesFilter(n: Headline, f: NewsFilter): boolean {
  if (f === "all") return true;
  if (f === "constructive" || f === "cautious") return signalLean(n.signal) === f;
  return tagLabel(n.signal) === f.slice(4);
}

/**
 * "2h" → "2h ago"; "today" stays; nothing usable → the row's own timestamp.
 * The model's recency is relative to when the batch was pulled, so the stored
 * created_at is the more honest fallback than inventing one.
 */
export function recencyLabel(when: string | undefined | null, createdAt: string | null, now: number): string | null {
  const w = (when ?? "").trim();
  if (w && w !== "—" && w !== "-") return /^\d+\s*[mhd]$/i.test(w) ? `${w.replace(/\s+/g, "")} ago` : w;
  return ago(createdAt, now);
}
