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
  return (key: string): string => {
    const re = new RegExp(`${esc(key)}\\s*:\\s*([\\s\\S]*?)(?=\\r?\\n[ \\t]*(?:${labels})[ \\t]*:|$)`, "i");
    const m = block.match(re);
    return m ? stripMd(m[1].trim()) : "";
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
  confirm: string;
  kill: string;
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
    const get = blockReader(b, ["name", "ticker", "class", "horizon", "thesis", "signals", "confirm", "kill"]);
    return { name: get("name"), ticker: get("ticker"), cls: get("class"), horizon: get("horizon"), thesis: get("thesis"), signals: get("signals"), confirm: get("confirm"), kill: get("kill") };
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
