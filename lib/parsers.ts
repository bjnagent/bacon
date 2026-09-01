// Response parsers — ported verbatim from reference/bacon-artifact.jsx.
// They turn the delimited (===SECTION=== / @@PICK@@ / @@ITEM@@) model output
// into typed objects. Keep the delimiters in sync with lib/prompts.ts.

import { normStance, type StanceKey } from "./lenses";

// Remove inline markdown emphasis the model sometimes slips into free-text
// fields (**bold**, __bold__, `code`) — every surface renders these as plain
// text, so the raw markers would show literally (e.g. "**Investor theme**").
function stripMd(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1");
}

// Read a labelled field out of a delimited block. Unlike a naive
// /key:\s*(.+)/ — which stops at the first newline and silently truncates
// multi-line values (a numbered signals list, wrapped prose) — this captures
// through to the next KNOWN label or the block end. `keys` is the block's full
// label set, so a value is only ever bounded by a real following field.
function blockReader(block: string, keys: string[]) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labels = keys.map(esc).join("|");
  // Labels may arrive wrapped in markdown emphasis — `**ticker:** NVDA` rather
  // than `ticker: NVDA`. Tolerating that is not cosmetic: the lookahead is what
  // BOUNDS each value, so when a bolded label goes unrecognised the field runs
  // straight through every field after it. That is not hypothetical — it put
  // rows like "** BTC-USD / IBIT\nclass: Crypto / ETF\nhorizon: weeks" into the
  // instrument column, roughly a third of filed calls, from the day the model
  // changed its formatting. `EMPH` is applied on both sides of every label and
  // after the colon, so bare and bolded output parse identically.
  const EMPH = "[*_]{0,2}";
  return (key: string): string => {
    const re = new RegExp(
      `${EMPH}${esc(key)}${EMPH}\\s*:\\s*${EMPH}\\s*([\\s\\S]*?)(?=\\r?\\n[ \\t]*${EMPH}(?:${labels})${EMPH}[ \\t]*:|$)`,
      "i",
    );
    const m = block.match(re);
    return m ? stripMd(m[1].trim()).replace(/^[*_\s]+/, "").trim() : "";
  };
}

export interface LensSection {
  stance: StanceKey;
  body: string;
  verify: string | null;
}

export interface Briefing {
  SUMMARY?: string;
  BOTTOMLINE?: string;
  VERDICT?: string; // Buy/Hold/Sell call + scenario estimates (free text, first word is the call)
  lenses: Record<string, LensSection>;
}

export function parseBriefing(text: string): Briefing {
  const out: Briefing = { lenses: {} };
  const parts = text.split(/===\s*([A-Z]+)\s*===/g);
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].trim().toUpperCase();
    let body = (parts[i + 1] || "").trim();
    if (key === "SUMMARY") { out.SUMMARY = body; continue; }
    if (key === "BOTTOMLINE") { out.BOTTOMLINE = body; continue; }
    if (key === "VERDICT") { out.VERDICT = body; continue; }
    let stance: string | null = null;
    const sm = body.match(/^\s*\[([^\]]+)\]/);
    if (sm) { stance = sm[1]; body = body.slice(sm[0].length).trim(); }
    let verify: string | null = null;
    const vm = body.split(/verify\s*:/i);
    if (vm.length > 1) { body = vm[0].trim(); verify = vm.slice(1).join("Verify:").trim(); }
    out.lenses[key] = { stance: normStance(stance), body, verify };
  }
  return out;
}

export type Debate = Record<string, string>;

export function parseDebate(text: string): Debate {
  const out: Debate = {};
  const parts = text.split(/===\s*([A-Z]+)\s*===/g);
  for (let i = 1; i < parts.length; i += 2) out[parts[i].trim().toUpperCase()] = (parts[i + 1] || "").trim();
  return out;
}

export interface ScoutPick {
  name: string;
  ticker: string;
  cls: string;
  why: string;
  now: string;
  check: string;
}

export interface ScoutResult {
  intro: string | null;
  picks: ScoutPick[];
  caveat: string | null;
}

export function parseScout(text: string): ScoutResult {
  let intro: string | null = null, caveat: string | null = null;
  const im = text.match(/===\s*INTRO\s*===([\s\S]*?)(?:@@PICK@@|===\s*CAVEAT|$)/i);
  if (im) intro = im[1].trim();
  const cm = text.match(/===\s*CAVEAT\s*===([\s\S]*)$/i);
  if (cm) caveat = cm[1].trim();
  const blocks = text.split(/@@PICK@@/i).slice(1);
  const picks = blocks.map((raw) => {
    const b = raw.split(/===\s*CAVEAT/i)[0];
    const get = blockReader(b, ["name", "ticker", "class", "why", "now", "check"]);
    return { name: get("name"), ticker: get("ticker"), cls: get("class"), why: get("why"), now: get("now"), check: get("check") };
  }).filter((p) => p.name || (p.ticker && p.ticker !== "—"));
  return { intro, picks, caveat };
}

export interface OpportunityItem {
  name: string;
  ticker: string;
  cls: string;
  horizon: string;
  thesis: string;
  signals: string;
  action: string;  // research: Buy | Accumulate | Watch · advice: BUY | SELL | TRIM | HOLD
  target: string;  // 12-mo estimate, labeled est.
  confirm: string;
  kill: string;
  // Advice-mode only, and empty in research mode. The schema is a SUPERSET
  // rather than a second shape so one parser and one storage path serve both
  // modes — the entitlement decides what the model is asked for, not how the
  // result is read back.
  entry: string;   // level or band to act in, with its anchor
  stop: string;    // level or condition at which the position is wrong
  size: string;    // position size as a % of the sleeve, and why that size
}

export interface OpportunityBrief {
  intro: string | null;
  items: OpportunityItem[];
  caveat: string | null;
}

export function parseOpportunities(text: string): OpportunityBrief {
  let intro: string | null = null, caveat: string | null = null;
  const im = text.match(/===\s*INTRO\s*===([\s\S]*?)(?:@@OPP@@|===\s*CAVEAT|$)/i);
  if (im) intro = im[1].trim();
  const cm = text.match(/===\s*CAVEAT\s*===([\s\S]*)$/i);
  if (cm) caveat = cm[1].trim();
  const blocks = text.split(/@@OPP@@/i).slice(1);
  const items = blocks.map((raw) => {
    const b = raw.split(/===\s*CAVEAT/i)[0];
    // Every advice label belongs in this list even though research mode never
    // emits them: the list is what BOUNDS each field, so an unlisted `stop:`
    // would be swallowed whole by `target` rather than simply being absent.
    const get = blockReader(b, ["name", "ticker", "class", "horizon", "thesis", "signals", "action", "entry", "target", "stop", "size", "confirm", "kill"]);
    return {
      name: get("name"), ticker: get("ticker"), cls: get("class"), horizon: get("horizon"),
      thesis: get("thesis"), signals: get("signals"), action: get("action"),
      target: get("target"), confirm: get("confirm"), kill: get("kill"),
      entry: get("entry"), stop: get("stop"), size: get("size"),
    };
  }).filter((o) => o.name || (o.ticker && o.ticker !== "—"));
  return { intro, items, caveat };
}

export interface ReviewItem { ticker: string; outcome: string; verdict: string }

export function parseBriefReview(text: string): { items: ReviewItem[]; note: string | null } {
  const nm = text.match(/===\s*NOTE\s*===([\s\S]*)$/i);
  const note = nm ? nm[1].trim() : null;
  const blocks = text.split(/@@ITEM@@/i).slice(1);
  const items = blocks.map((raw) => {
    const b = raw.split(/===\s*NOTE/i)[0];
    const get = blockReader(b, ["ticker", "outcome", "verdict"]);
    return { ticker: get("ticker"), outcome: get("outcome"), verdict: get("verdict").toLowerCase() };
  }).filter((r) => r.ticker);
  return { items, note };
}

export interface KillAlertItem { ticker: string; why: string }

export function parseKillWatch(text: string): { items: KillAlertItem[]; note: string | null } {
  const nm = text.match(/===\s*NOTE\s*===([\s\S]*)$/i);
  const note = nm ? nm[1].trim() : null;
  const blocks = text.split(/@@KILL@@/i).slice(1);
  const items = blocks.map((raw) => {
    const b = raw.split(/===\s*NOTE/i)[0];
    const get = blockReader(b, ["ticker", "why"]);
    return { ticker: get("ticker"), why: get("why") };
  }).filter((k) => k.ticker && k.why);
  return { items, note };
}

export interface TrackingUpdate {
  update: string;
  watch: string;
  lean: StanceKey | null;
  leanReason: string;
}

export function parseTrackingUpdate(text: string): TrackingUpdate {
  const out: TrackingUpdate = { update: "", watch: "", lean: null, leanReason: "" };
  const parts = text.split(/===\s*([A-Z]+)\s*===/g);
  for (let i = 1; i < parts.length; i += 2) {
    const k = parts[i].trim().toUpperCase();
    const v = (parts[i + 1] || "").trim();
    if (k === "UPDATE") out.update = v;
    else if (k === "WATCH") out.watch = v;
    else if (k === "LEAN") { const head = v.split(/[—-]/)[0]; out.lean = normStance(head); out.leanReason = v.replace(/^[^—-]*[—-]\s*/, "").trim(); }
  }
  return out;
}

export interface NewsItem {
  head: string;
  source: string;
  why: string;
  ticker: string;
  cls: string;
  signal: string;
  when: string;
}

export interface NewsResult {
  intro: string | null;
  items: NewsItem[];
  note: string | null;
}

export function parseNews(text: string): NewsResult {
  let intro: string | null = null, note: string | null = null;
  const im = text.match(/===\s*INTRO\s*===([\s\S]*?)(?:@@ITEM@@|===\s*NOTE|$)/i);
  if (im) intro = im[1].trim();
  const nm = text.match(/===\s*NOTE\s*===([\s\S]*)$/i);
  if (nm) note = nm[1].trim();
  const blocks = text.split(/@@ITEM@@/i).slice(1);
  const items = blocks.map((raw) => {
    const b = raw.split(/===\s*NOTE/i)[0];
    const get = blockReader(b, ["head", "source", "why", "ticker", "class", "signal", "when"]);
    return { head: get("head"), source: get("source"), why: get("why"), ticker: get("ticker"), cls: get("class"), signal: get("signal"), when: get("when") };
  }).filter((n) => n.head);
  return { intro, items, note };
}

export function toPoints(text: string): string[] {
  return (text || "").split(/\n+/).map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
}
