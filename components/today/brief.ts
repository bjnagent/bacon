// Pure helpers for the Today brief: shapes, parsing of the stored free-text
// fields, and the small presentation decisions (tone of a call, wording of a
// trigger, how stale a quote is). Kept free of React and I/O so every one of
// them is tested directly — these are the places a wrong colour or a wrong
// label would mislead someone about a security.

import { parseOpportunities } from "@/lib/parsers";
import type { Trigger } from "@/lib/triggers";
import type { ChatContext } from "@/lib/prompts";
import { mapClass } from "@/lib/lenses";

export interface BriefItem {
  id: string; name: string; ticker: string; cls: string; horizon: string;
  thesis: string; signals: string; checks: string;
  action?: string; target?: string;
  // Advice mode only. Absent (or empty) in research mode, and the card simply
  // doesn't render the rows.
  entry?: string; stop?: string; size?: string;
}

export interface Brief { intro: string | null; caveat: string | null; generatedAt: string | null; items: BriefItem[] }

/** GET /api/brief */
export interface BriefResponse { brief?: Brief; house?: boolean }

/** One entry of GET /api/quotes — never estimated, and `live` says how fresh. */
export interface QuoteLite { price: number; changePct: number | null; live: boolean; source: string; at?: string }

export type Tone = "pos" | "neg" | "warn" | "info" | "neutral";

/** A brief item names a tradable symbol unless the model wrote "—". */
export function hasTicker(o: { ticker?: string }): boolean {
  const t = (o.ticker ?? "").trim();
  return !!t && t !== "—" && t !== "-";
}

/** What Analyze / Track / Ask act on: the ticker when there is one, else the name. */
export function itemSymbol(o: { ticker?: string; name: string }): string {
  return hasTicker(o) ? o.ticker!.trim() : o.name.trim();
}

/**
 * "Accumulate — capacity sold out into 2027" → verb + reason.
 *
 * Splits on the FIRST spaced dash or em/en dash only: a bare hyphen inside a
 * word ("re-rate", "AI-led") is part of the reason, not the separator. Advice
 * mode writes the verb in capitals ("BUY"); it is shown in sentence case like
 * every other label.
 */
export function splitCall(action: string | undefined | null): { verb: string; reason: string } {
  const a = (action ?? "").trim();
  if (!a) return { verb: "", reason: "" };
  const m = a.match(/^(.*?)(?:\s+[-–—]\s+|\s*[—–]\s*)(.*)$/);
  const head = (m ? m[1] : a).trim();
  const reason = (m ? m[2] : "").trim();
  const verb = head ? head[0].toUpperCase() + head.slice(1).toLowerCase() : "";
  return { verb, reason };
}

/**
 * Colour of a call, by its verb. TRIM and HOLD only arrive in advice mode, and
 * without their own case a "Trim" would render in buy-green — the one place a
 * colour is genuinely misleading. An unrecognised verb gets no colour at all
 * rather than a guessed one.
 */
export function callTone(action: string | undefined | null): Tone {
  const v = splitCall(action).verb.toLowerCase();
  if (/^(buy|accumulate|add)\b/.test(v)) return "pos";
  if (/^(sell|avoid|short|exit)\b/.test(v)) return "neg";
  if (/^(trim|hold|watch|wait)\b/.test(v)) return "warn";
  return "neutral";
}

/**
 * The stored check line is "Confirm: … · Kill: …" (briefToRows joins them so).
 * Pull the two back apart so they can be shown as two labelled rows. Anything
 * that doesn't follow the shape is returned whole as `other` — never dropped.
 */
export function splitChecks(checks: string | undefined | null): { confirm: string; kill: string; other: string } {
  const c = (checks ?? "").trim();
  if (!c) return { confirm: "", kill: "", other: "" };
  const killAt = c.search(/(?:^|\s)kill\s*:/i);
  const confirmAt = c.search(/(?:^|\s)confirm\s*:/i);
  if (killAt < 0 && confirmAt < 0) return { confirm: "", kill: "", other: c };
  const strip = (s: string) => s.replace(/^\s*(confirm|kill)\s*:\s*/i, "").replace(/\s*[·•|]\s*$/, "").trim();
  let confirm = "", kill = "";
  if (confirmAt >= 0) confirm = strip(c.slice(confirmAt, killAt > confirmAt ? killAt : undefined));
  if (killAt >= 0) kill = strip(c.slice(killAt, confirmAt > killAt ? confirmAt : undefined));
  return { confirm, kill, other: "" };
}

/** "a · b · c" or "a; b; c" → bullet points. A single clause stays one item. */
export function splitSignals(signals: string | undefined | null): string[] {
  const s = (signals ?? "").trim();
  if (!s) return [];
  const parts = s.split(/\s+·\s+|;\s+/).map((p) => p.trim().replace(/[;.]$/, "")).filter(Boolean);
  return parts.length > 1 ? parts : [s];
}

/** Streamed synthesis text → a renderable brief, or null until there's something to show. */
export function streamToBrief(text: string): Brief | null {
  const b = parseOpportunities(text);
  if (!b.intro && b.items.length === 0) return null;
  return {
    intro: b.intro, caveat: b.caveat, generatedAt: null,
    items: b.items.map((o, i) => ({
      id: `stream-${i}`, name: o.name, ticker: o.ticker, cls: o.cls, horizon: o.horizon,
      thesis: o.thesis, signals: o.signals, action: o.action, target: o.target,
      entry: o.entry, stop: o.stop, size: o.size,
      checks: [o.confirm && `Confirm: ${o.confirm}`, o.kill && `Kill: ${o.kill}`].filter(Boolean).join(" · "),
    })),
  };
}

/** Sentence-cased trigger copy and its tone. A breached stop is the loudest thing on a card. */
export function triggerView(t: Trigger): { tone: Tone; title: string; body: string } {
  if (t.kind === "stop") {
    return {
      tone: "neg", title: "Stop breached",
      body: /above/.test(t.label) ? "Price has run above this call's stop level." : "Price is through this call's stop level.",
    };
  }
  if (t.kind === "target") return { tone: "pos", title: "Target reached", body: "Price has reached the stated target." };
  return { tone: "info", title: "In entry range", body: "Price is inside the stated entry range." };
}

/** Compact relative time against an explicit clock (render stays pure). */
export function ago(iso: string | null | undefined, now: number): string | null {
  if (!iso || !now) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

/** "Sunday, October 11" in the reader's own locale and time zone. */
export function localDateLabel(now: number): string {
  return new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function formatPrice(p: number): string {
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: p < 10 ? 4 : 2 });
}

/**
 * The staleness label on a quote. Not decoration: a delayed close shown as a
 * live price is the same class of error as a fabricated one. A "live" price
 * that was fetched a while ago is also no longer live, so past `liveForMs` it
 * is labelled with its time instead.
 */
export function quoteLabel(q: QuoteLite, fetchedAt: number, now: number, liveForMs = 120_000): { text: string; title: string; live: boolean } {
  const asOf = q.at ? new Date(q.at) : null;
  const asOfText = asOf && Number.isFinite(asOf.getTime())
    ? asOf.toLocaleString(undefined, q.live ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" })
    : null;
  if (!q.live) {
    return { text: "close", live: false, title: `Delayed close via ${q.source}${asOfText ? `, as of ${asOfText}` : ""}` };
  }
  const fresh = now - fetchedAt < liveForMs;
  return {
    text: fresh ? "live" : (asOfText ?? "earlier"),
    live: fresh,
    title: `${fresh ? "Live" : "Real-time when fetched"} via ${q.source}${asOfText ? `, as of ${asOfText}` : ""}`,
  };
}

/** The chat context an idea opens with — grounded in exactly what the card says. */
export function ideaChatContext(o: BriefItem): ChatContext {
  const sym = itemSymbol(o);
  return {
    kind: "asset", asset: sym, cls: mapClass(o.cls), title: sym.toUpperCase(), sub: "today's brief",
    notes: `From today's opportunity brief — Thesis: ${o.thesis}. Signals: ${o.signals}. ${o.checks}`,
  };
}

/** The ticker list a brief needs prices for (deduped, upper-cased, stable order). */
export function quoteSymbols(items: BriefItem[]): string[] {
  const out: string[] = [];
  for (const o of items) {
    if (!hasTicker(o)) continue;
    const t = o.ticker.trim().toUpperCase();
    if (!out.includes(t)) out.push(t);
  }
  return out;
}
