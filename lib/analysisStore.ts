// Persisted deep dives — the pure rules behind analysis history and the shared
// cache. Pure functions and types only (no I/O, no server imports), so the
// routes that write rows, the routes that read them and the Analyze screen
// all agree on one definition of "the same analysis", "fresh enough" and
// "safe to share". The I/O that applies these rules lives in
// app/api/analyses/store.ts (server-only).
//
// Why a cache at all: a deep dive is a ~$0.20 web-searched model run. The same
// ticker is asked about by many members on the same day, and the answer does
// not change by the hour. Serving a recent, NON-personal run of the same symbol
// costs nobody anything; re-running it bills the member and us for a near-copy.

import { LENSES, mapClass, overallLean, type LensKey, type StanceKey } from "./lenses";
import { parseBriefing, type Briefing } from "./parsers";

const HOUR = 3_600_000;

/** How long a non-personal analysis is served to other members. */
export const SHARED_TTL_MS = 6 * HOUR;
/** An explicit run of a name you analyzed this recently reopens yours instead of re-billing. */
export const REUSE_TTL_MS = 6 * HOUR;
/** Opening a bare /analyze/SYM link reopens your own analysis up to this old. */
export const REOPEN_TTL_MS = 24 * HOUR;

/** Deep-tool results stored on an analysis row (client-patchable). */
export const EXTRA_KEYS = ["debate", "personas", "redteam", "chain"] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];
/** Every deep tool answers as ===SECTION=== blocks, parsed to { SECTION: text }. */
export type ToolResult = Record<string, string>;
export type ToolExtras = Partial<Record<ExtraKey, ToolResult>>;

/**
 * What the grounding layer could NOT supply for a run. Stored as codes (not the
 * model-facing sentences) so the screen can say it in plain words.
 */
export type GapCode = "unmatched" | "no_price" | "no_fundamentals";
const GAP_CODES: GapCode[] = ["unmatched", "no_price", "no_fundamentals"];

/** Server-written facts about a run, kept in `extras.meta` (never client-patchable). */
export interface StoredMeta {
  verified: boolean;
  /** The listed symbol a company NAME resolved to ("Nike" -> "NKE"), else null. */
  resolved: string | null;
  gaps: GapCode[];
}

export type Extras = ToolExtras & { meta?: StoredMeta };

export interface AnalysisRow {
  id: string;
  user_id: string;
  symbol: string;
  query: string;
  asset_class: string;
  content: string;
  extras: Extras | null;
  personal: boolean;
  shared_from: string | null;
  created_at: string;
}

/** Columns every reader selects. */
export const ROW_COLUMNS = "id,user_id,symbol,query,asset_class,content,extras,personal,shared_from,created_at";

/** miss = generated for this request · own = your own recent run · hit = a shared run, copied to you. */
export type CacheState = "miss" | "own" | "hit";

/** Everything the screen needs to label an analysis honestly. */
export interface AnalysisMeta {
  id: string | null;
  symbol: string;
  query: string;
  assetClass: string;
  /** When the content was generated (a shared copy keeps the original's time). */
  generatedAt: string;
  cache: CacheState;
  shared: boolean;
  verified: boolean;
  resolved: string | null;
  gaps: GapCode[];
}

export interface StoredAnalysis {
  meta: AnalysisMeta;
  content: string;
  extras: ToolExtras;
}

// ---------------------------------------------------------------- identity

/**
 * The cache key for a symbol: upper-case, no whitespace, no pair slash, no
 * leading "$". "usd/jpy", "USDJPY" and "USD JPY" are one key; "BRK.B" and
 * "BTC-USD" keep their punctuation because it is part of the symbol.
 */
export function symbolKey(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase().replace(/^\$+/, "").replace(/[\s/]+/g, "").slice(0, 40);
}

/**
 * The key a run is filed under. A verified resolution wins ("Nike" files as
 * NKE, so the next person typing NKE shares it); anything unverified keys on
 * what was typed. Deliberately NOT cleanTicker's extraction: for "USD/JPY" that
 * returns "USD", which would make every dollar pair share one cache entry.
 */
export function cacheKey(asset: string, resolution: { symbol: string | null; verified: boolean }): string {
  return resolution.verified && resolution.symbol ? symbolKey(resolution.symbol) : symbolKey(asset);
}

/** A run is personal when its prompt carried this account's own call history. Personal runs are never shared. */
export function isPersonal(calibrationMemo: string | null | undefined, instrumentMemo: string | null | undefined): boolean {
  return !!(calibrationMemo && calibrationMemo.trim()) || !!(instrumentMemo && instrumentMemo.trim());
}

/** Does a stored row answer a request for `symbol`? Matches the filed key or what was typed. */
export function matchesSymbol(row: Pick<AnalysisRow, "symbol" | "query">, symbol: string): boolean {
  const k = symbolKey(symbol);
  return !!k && (symbolKey(row.symbol) === k || symbolKey(row.query) === k);
}

// ---------------------------------------------------------------- freshness + quality

export function isFresh(iso: string | null | undefined, ttlMs: number, now = Date.now()): boolean {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  // A minute of tolerance for clock skew between the app server and the database.
  return age <= ttlMs && age >= -60_000;
}

/** Enough of a briefing to render (the screen's own threshold). */
export function isUsableBriefing(b: Briefing): boolean {
  return !!b.SUMMARY || Object.keys(b.lenses).length >= 3;
}

/** Complete enough to hand to someone else: a summary, a call, and most of the lenses. */
export function isCompleteBriefing(b: Briefing): boolean {
  const lenses = LENSES.filter((l) => b.lenses[l.key]).length;
  return !!b.SUMMARY && !!b.VERDICT && lenses >= 6;
}

export function readMeta(extras: unknown): StoredMeta {
  const m = (extras && typeof extras === "object" ? (extras as { meta?: unknown }).meta : null) as Partial<StoredMeta> | null | undefined;
  return {
    verified: !!m?.verified,
    resolved: typeof m?.resolved === "string" && m.resolved ? m.resolved : null,
    gaps: Array.isArray(m?.gaps) ? (m!.gaps as unknown[]).filter((g): g is GapCode => GAP_CODES.includes(g as GapCode)) : [],
  };
}

/**
 * May this row be served to another member? Only an original (not a copy),
 * non-personal, fresh, complete run with no data gaps. A run that went out
 * while a provider was down says so in its text — right for the member who
 * paid for it, wrong to hand to the next six hours of visitors.
 */
export function isShareableRow(row: AnalysisRow, now = Date.now()): boolean {
  if (row.personal || row.shared_from) return false;
  if (!isFresh(row.created_at, SHARED_TTL_MS, now)) return false;
  if (readMeta(row.extras).gaps.length) return false;
  return isCompleteBriefing(parseBriefing(row.content || ""));
}

export function newestFirst<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** The newest shareable candidate (the query narrows; this decides). */
export function pickShared(rows: AnalysisRow[], now = Date.now()): AnalysisRow | null {
  return newestFirst(rows).find((r) => isShareableRow(r, now)) ?? null;
}

/** The member's own newest usable analysis of `symbol` within `ttlMs` (any class when `cls` is null). */
export function pickOwn(rows: AnalysisRow[], symbol: string, cls: string | null, ttlMs: number, now = Date.now()): AnalysisRow | null {
  const klass = cls ? mapClass(cls) : null;
  return newestFirst(rows).find((r) =>
    matchesSymbol(r, symbol)
    && (!klass || r.asset_class === klass)
    && isFresh(r.created_at, ttlMs, now)
    && isUsableBriefing(parseBriefing(r.content || "")),
  ) ?? null;
}

// ---------------------------------------------------------------- row shaping

export function newRow(input: {
  id: string; userId: string; key: string; query: string; assetClass: string;
  content: string; personal: boolean; meta: StoredMeta;
}) {
  return {
    id: input.id,
    user_id: input.userId,
    symbol: input.key,
    query: input.query.slice(0, 120),
    asset_class: mapClass(input.assetClass),
    content: input.content,
    extras: { meta: input.meta } as Extras,
    personal: input.personal,
  };
}

/**
 * A shared hit, filed into another member's history. Only the briefing and its
 * data facts travel: deep-tool results stay with the member who paid for them
 * (and whose plan unlocked them). `created_at` is the ORIGINAL's, so "generated
 * 5h ago" stays true and a copy can never be re-served as fresh.
 */
export function copyRow(hit: AnalysisRow, userId: string, query: string) {
  return {
    user_id: userId,
    symbol: hit.symbol,
    query: (query || hit.query).slice(0, 120),
    asset_class: hit.asset_class,
    content: hit.content,
    extras: { meta: readMeta(hit.extras) } as Extras,
    personal: false,
    shared_from: hit.id,
    created_at: hit.created_at,
  };
}

export function toolExtras(extras: unknown): ToolExtras {
  const out: ToolExtras = {};
  if (!extras || typeof extras !== "object") return out;
  for (const k of EXTRA_KEYS) {
    const v = cleanToolResult((extras as Record<string, unknown>)[k]);
    if (v) out[k] = v;
  }
  return out;
}

export function metaFromRow(row: AnalysisRow, cache: CacheState): AnalysisMeta {
  const m = readMeta(row.extras);
  return {
    id: row.id ?? null,
    symbol: row.symbol,
    query: row.query,
    assetClass: row.asset_class,
    generatedAt: row.created_at,
    cache,
    shared: cache === "hit" || !!row.shared_from,
    verified: m.verified,
    resolved: m.resolved,
    gaps: m.gaps,
  };
}

export function toStored(row: AnalysisRow, cache: CacheState): StoredAnalysis {
  return { meta: metaFromRow(row, cache), content: row.content, extras: toolExtras(row.extras) };
}

// ---------------------------------------------------------------- deep-tool extras

const SECTION_RE = /^[A-Z]{2,24}$/;

/** A tool result as stored: { SECTION: text }, capped. Null when it isn't one. */
export function cleanToolResult(v: unknown): ToolResult | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: ToolResult = {};
  let n = 0;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (n >= 16) break;
    if (!SECTION_RE.test(k) || typeof val !== "string") continue;
    out[k] = val.slice(0, 12_000);
    n++;
  }
  return n ? out : null;
}

/**
 * Validate a client PATCH `{ extras }`: only the four tool keys, each a tool
 * result. Null when anything else is present or nothing valid remains — the
 * route answers 400 rather than silently dropping part of a write.
 */
export function parseExtrasPatch(v: unknown): ToolExtras | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: ToolExtras = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!(EXTRA_KEYS as readonly string[]).includes(k)) return null;
    const clean = cleanToolResult(val);
    if (!clean) return null;
    out[k as ExtraKey] = clean;
  }
  return Object.keys(out).length ? out : null;
}

/** Merge tool results into stored extras, keeping `meta` and anything else already there. */
export function mergeExtras(existing: unknown, patch: ToolExtras): Extras {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...(existing as Extras) } : {};
  for (const k of EXTRA_KEYS) if (patch[k]) base[k] = patch[k];
  return base;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ---------------------------------------------------------------- the meta line

/**
 * /api/analyze answers in plain text so the client can render lenses as they
 * stream. Its first line carries the run's facts (id, cache state, data gaps):
 * the shared stream reader returns only text, not headers, and the screen needs
 * to say "shared, 2h old" or "price data unavailable" before the first lens
 * lands. parseBriefing ignores everything before the first ===SECTION===, so
 * a reader that doesn't know about the line is unaffected.
 */
export const META_PREFIX = "@@bacon-meta ";

export function encodeMeta(meta: AnalysisMeta): string {
  return `${META_PREFIX}${JSON.stringify(meta)}\n`;
}

// The marker lib/streamRoute appends when the upstream call dies mid-stream.
const ERROR_TAIL = /\n\n\[error: [^\]]*\]\s*$/;

/** Split streamed text into its meta line and the briefing body (error marker removed). */
export function splitStream(text: string): { meta: AnalysisMeta | null; body: string } {
  let meta: AnalysisMeta | null = null;
  let body = text;
  if (text.startsWith(META_PREFIX)) {
    const nl = text.indexOf("\n");
    if (nl < 0) return { meta: null, body: "" };   // the line itself is still arriving
    try { meta = JSON.parse(text.slice(META_PREFIX.length, nl)) as AnalysisMeta; } catch { meta = null; }
    body = text.slice(nl + 1);
  }
  return { meta, body: body.replace(ERROR_TAIL, "") };
}

// ---------------------------------------------------------------- summaries

export type LeanKey = "constructive" | "tilts-constructive" | "mixed" | "tilts-cautious" | "cautious";
export type Call = "Buy" | "Hold" | "Sell";

const LEAN_BY_LABEL: Record<string, LeanKey> = {
  "Constructive lean": "constructive",
  "Tilts constructive": "tilts-constructive",
  "Tilts cautious": "tilts-cautious",
  "Cautious lean": "cautious",
};

/** Each lens's stance; a lens the model never returned counts as limited data, not "mixed". */
export function stancesOf(b: Briefing): Record<LensKey, StanceKey> {
  const out = {} as Record<LensKey, StanceKey>;
  for (const l of LENSES) out[l.key] = b.lenses[l.key]?.stance ?? "limited-data";
  return out;
}

/** The aggregate lean, by lib/lenses' own voting rule. */
export function leanOf(stances: Partial<Record<LensKey, StanceKey>>): LeanKey {
  return LEAN_BY_LABEL[overallLean(stances).label] ?? "mixed";
}

/** The verdict's call word — the first word of its first line, when it is one. */
export function callOf(verdict: string | null | undefined): Call | null {
  const head = String(verdict ?? "").split("\n")[0].trim().replace(/^[*_\s]+/, "").toLowerCase();
  if (head.startsWith("buy")) return "Buy";
  if (head.startsWith("sell")) return "Sell";
  if (head.startsWith("hold")) return "Hold";
  return null;
}

export interface AnalysisListItem {
  id: string;
  symbol: string;
  query: string;
  asset_class: string;
  created_at: string;
  shared_from: string | null;
  lean: LeanKey | null;
  call: Call | null;
}

/** A history row as listed: identity plus the lean and call, derived from the stored briefing. */
export function listItem(row: Pick<AnalysisRow, "id" | "symbol" | "query" | "asset_class" | "created_at" | "shared_from" | "content">): AnalysisListItem {
  const b = parseBriefing(row.content || "");
  const usable = isUsableBriefing(b);
  return {
    id: row.id, symbol: row.symbol, query: row.query, asset_class: row.asset_class,
    created_at: row.created_at, shared_from: row.shared_from ?? null,
    lean: usable ? leanOf(stancesOf(b)) : null,
    call: callOf(b.VERDICT),
  };
}
