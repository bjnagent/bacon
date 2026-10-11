// The chat wire format, shared by the sheet and /api/chat.
//
// Pure functions, no React and no I/O, so the server route and the client
// agree on exactly one definition of "a valid history" and "the same
// conversation" — and both can be unit-tested without a browser or a database.
// It lives beside the sheet because the sheet is its main user; the route
// imports it from here rather than keeping a second copy that could drift.

import type { ChatContext, ChatKind } from "@/lib/prompts";

export type Role = "user" | "assistant";
export interface WireMessage { role: Role; content: string }

/** Turns sent per request. Older turns add cost without adding much grounding. */
export const MAX_TURNS = 24;
/** Characters per message — also the composer's maxLength. */
export const MAX_CHARS = 6000;

const KINDS: ReadonlySet<ChatKind> = new Set<ChatKind>(["asset", "tracked", "radar", "news", "news-feed", "frameworks", "sizing", "general"]);

/**
 * Turn whatever arrived into a history the model API accepts: known roles,
 * capped lengths, no empty turns, consecutive same-role turns merged (a
 * failed or stopped turn leaves two user messages in a row), and starting
 * with a user turn. Clamped to the most recent MAX_TURNS.
 */
export function normalizeHistory(raw: unknown, maxTurns = MAX_TURNS, maxChars = MAX_CHARS): WireMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: WireMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role: Role = (m as { role?: unknown }).role === "assistant" ? "assistant" : "user";
    const content = String((m as { content?: unknown }).content ?? "").trim().slice(0, maxChars);
    if (!content) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content}\n\n${content}`.slice(0, maxChars);
    else out.push({ role, content });
  }
  const recent = out.slice(-maxTurns);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}

function cap(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

/**
 * The context arrives from the client and is both written into the system
 * prompt and stored with every saved message, so it is rebuilt field by field
 * with caps rather than trusted: an oversized `notes` would otherwise be paid
 * for on every turn, and unknown keys would be persisted verbatim.
 */
export function sanitizeContext(raw: unknown): ChatContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = KINDS.has(r.kind as ChatKind) ? (r.kind as ChatKind) : "general";
  const ctx: ChatContext = { kind };
  const fields: [keyof ChatContext, number][] = [
    ["asset", 60], ["cls", 60], ["ticker", 24], ["title", 80], ["sub", 120],
    ["headline", 300], ["thesis", 1200], ["update", 1200], ["notes", 6000],
  ];
  for (const [k, max] of fields) {
    const v = cap(r[k], max);
    if (v) (ctx as unknown as Record<string, unknown>)[k] = v;
  }
  if (Array.isArray(r.assets)) {
    const assets = r.assets.map((a) => cap(a, 24)).filter((a): a is string => !!a).slice(0, 60);
    if (assets.length) ctx.assets = assets;
  }
  return ctx;
}

/**
 * Two contexts are "the same conversation" when they're about the same thing:
 * the same name (whether opened from Analyze, the watchlist or the brief), the
 * same headline, or the same broad view. Titles and grounding notes change
 * between screens and don't count.
 */
export function contextKey(ctx: ChatContext | null | undefined): string {
  if (!ctx) return "general";
  switch (ctx.kind) {
    case "asset":
    case "tracked":
      return `name:${(ctx.asset || ctx.ticker || ctx.title || "").trim().toUpperCase()}`;
    case "news":
      return `news:${(ctx.headline || ctx.title || "").trim()}`;
    default:
      return ctx.kind || "general";
  }
}

export function sameContext(a: ChatContext | null | undefined, b: ChatContext | null | undefined): boolean {
  return contextKey(a) === contextKey(b);
}

/** apiStream reports the server's mid-stream failure marker as text first; never show it. */
export function stripErrorMarker(text: string): string {
  return text.replace(/\n\n\[error: [^\]]*\]\s*$/, "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** A v4 UUID — conversation ids are a uuid column, so the client must mint real ones. */
export function uuid(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Header copy for a context: "NVDA" / "Multi-lens analysis". */
export function contextLabel(ctx: ChatContext | null | undefined): { title: string; sub: string } {
  const title = ctx?.title?.trim() || "Ask Bacon";
  const raw = ctx?.sub?.trim() || (ctx && ctx.kind !== "general" ? "" : "Open discussion");
  return { title, sub: raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "" };
}

/** Empty-state heading for a context. */
export function introTitle(ctx: ChatContext | null | undefined): string {
  switch (ctx?.kind) {
    case "asset":
    case "tracked":
      return ctx.title || ctx.asset ? `Ask about ${ctx.title || ctx.asset}` : "What are you researching?";
    case "radar": return "Ask about your watchlist";
    case "news": return "Ask about this story";
    case "news-feed": return "Ask about today's headlines";
    case "sizing": return "Think through sizing";
    case "frameworks": return "Ask about the lenses";
    default: return "What are you researching?";
  }
}

/** "just now", "5 min ago", "3 hr ago", "yesterday", "4 days ago", or a date. */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
