"use client";

import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight, Bookmark, CircleUser, CircleX, Clock, CornerDownLeft, Crown, History, House,
  MessageCircle, Newspaper, ScanSearch, Search, Sunrise,
} from "lucide-react";
import { Sheet } from "@/components/ui";
import { AppCtx, type WatchItem } from "@/components/app/AppContext";
import { FINE_POINTER, useMedia } from "@/components/chat/useMedia";
import { mapClass, splitSymCls } from "@/lib/lenses";
import { haptic } from "@/lib/native";
import { track } from "@/lib/track";
// The palette's styles sit with the chat sheet's (same overlay family).
import s from "@/components/chat/Search.module.css";

export interface PaletteAction { id: string; label: string; hint?: string; icon?: ReactNode; run: () => void }

// Queries land in the behaviour ledger, and the palette accepts arbitrary
// typing — a pasted wall of text would otherwise be stored verbatim.
const MAX_Q = 120;

const RECENT_KEY = "bacon.search.recent";
const RECENT_MAX = 6;

// ⌘K / "/" search — the primary way to find a name or jump somewhere. Type a
// ticker, company or pair to analyze it, or a destination (today, record…).
//
// This is the product's search box, so what gets typed here is recorded: which
// names people look for, and — the reason the tracking exists — which searches
// ended in nothing. A query typed and then abandoned is demand the product
// didn't serve, and it is invisible everywhere else.

const ACTION_ICON: Record<string, ReactNode> = {
  today: <Sunrise />, news: <Newspaper />, watchlist: <Bookmark />, property: <House />,
  analyze: <ScanSearch />, record: <History />, discuss: <MessageCircle />, plans: <Crown />, account: <CircleUser />,
};

const NAME = /^[\p{L}\p{N}^][\p{L}\p{N} .&'/=:^-]*$/u;

/** A ticker ("NVDA", "BRK.B", "^GSPC"), a pair ("EUR/USD", "BTC-USD") or a short company name. */
export function looksLikeName(q: string): boolean {
  const t = q.trim();
  return !!t && t.length <= 40 && t.split(/\s+/).length <= 5 && NAME.test(t);
}

/** "nvda" → "NVDA"; a multi-word name stays as typed. */
function display(q: string): { text: string; ticker: boolean } {
  const { sym } = splitSymCls(q);
  return sym.includes(" ") ? { text: q.trim(), ticker: false } : { text: sym, ticker: true };
}

/** Pass a watchlist item's class along, so a crypto or FX name isn't analyzed as a stock. */
const CLASS_HINT: Record<string, string> = { "ETF / Fund": "etf", "FX / Currency pair": "fx", Crypto: "crypto", Commodity: "commodity", "Bond / Rates": "bond" };
function watchQuery(w: WatchItem): string {
  const hint = CLASS_HINT[mapClass(w.asset_class)];
  return hint ? `${w.symbol} ${hint}` : w.symbol;
}

function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function writeRecent(list: string[]): void {
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private mode / storage full */ }
}
export function pushRecent(list: string[], q: string): string[] {
  const t = q.trim().slice(0, MAX_Q);
  if (!t) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
}

type Item =
  | { kind: "analyze"; id: string; query: string; tracked: boolean }
  | { kind: "watch"; id: string; item: WatchItem }
  | { kind: "recent"; id: string; query: string }
  | { kind: "action"; id: string; action: PaletteAction };
interface Group { id: string; title: string; items: Item[]; clear?: boolean }

function buildGroups(q: string, actions: PaletteAction[], all: WatchItem[], recent: string[]): Group[] {
  // One row per symbol, even if an optimistic add and its saved row overlap.
  const watchlist = all.filter((w, i) => all.findIndex((x) => x.symbol.toUpperCase() === w.symbol.toUpperCase()) === i);
  const t = q.trim();
  const ql = t.toLowerCase();
  if (!ql) {
    return [
      { id: "recent", title: "Recent", clear: true, items: recent.map((r) => ({ kind: "recent" as const, id: `recent:${r}`, query: r })) },
      { id: "watch", title: "Your watchlist", items: watchlist.slice(0, 5).map((w) => ({ kind: "watch" as const, id: `watch:${w.symbol}`, item: w })) },
      { id: "goto", title: "Go to", items: actions.map((a) => ({ kind: "action" as const, id: `action:${a.id}`, action: a })) },
    ].filter((g) => g.items.length);
  }

  const hits = actions
    .filter((a) => a.label.toLowerCase().includes(ql) || (a.hint ?? "").toLowerCase().includes(ql) || a.id.includes(ql))
    // Labels that start with the query first: "rec" → Track record before anything that merely contains it.
    .sort((a, b) => Number(!a.label.toLowerCase().startsWith(ql)) - Number(!b.label.toLowerCase().startsWith(ql)));
  const exact = watchlist.find((w) => w.symbol.toLowerCase() === ql);
  const watch = watchlist.filter((w) => w !== exact && w.symbol.toLowerCase().includes(ql)).slice(0, 6);

  const analyze: Group = {
    id: "analyze", title: "Analyze",
    items: looksLikeName(t) ? [{ kind: "analyze", id: "__analyze", query: exact ? watchQuery(exact) : t, tracked: !!exact }] : [],
  };
  const yours: Group = { id: "watch", title: "Your watchlist", items: watch.map((w) => ({ kind: "watch" as const, id: `watch:${w.symbol}`, item: w })) };
  const goto: Group = { id: "goto", title: "Go to", items: hits.map((a) => ({ kind: "action" as const, id: `action:${a.id}`, action: a })) };

  // A query that reads as a destination ("watch", "news", "acc…") would
  // otherwise have Enter analyze a ticker called WATCH. Put destinations first
  // for those; a name search keeps "Analyze" on top.
  const command = ql.length >= 3 && actions.some((a) => a.id === ql || a.label.toLowerCase().split(/[^a-z]+/).some((w) => w.startsWith(ql)));
  return (command ? [goto, analyze, yours] : [analyze, yours, goto]).filter((g) => g.items.length);
}

export default function CommandPalette({ open, onClose, actions, onAnalyze }: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  onAnalyze: (sym: string) => void;
}) {
  const app = useContext(AppCtx);
  const watchlist = app?.watchlist ?? [];
  const fine = useMedia(FINE_POINTER);
  const listId = useId();
  const titleId = useId();

  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => (open && typeof window !== "undefined" ? readRecent() : []));
  // Each opening starts clean, with the latest recents. Adjusted while
  // rendering so the previous query never flashes up.
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) { setQ(""); setSel(0); setRecent(readRecent()); }
  }

  // The live query, and whether anything was actually run this time round.
  // Abandonment is measured against the second: without it, every successful
  // search would also be recorded as a dead end on the way out.
  const qRef = useRef("");
  const actedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  // Synced inside the commit, so a keystroke followed at once by Escape still
  // records the query that was on screen.
  useLayoutEffect(() => { qRef.current = q; onCloseRef.current = onClose; });
  useEffect(() => { if (open) actedRef.current = false; }, [open]);

  // Only the settled query is recorded — one event per visit to the palette,
  // on the way out. Recording as they type would put every prefix of "NVDA" in
  // the ledger and drown the signal in its own keystrokes.
  //
  // Stable identity: the Sheet re-runs its focus handling when onClose changes.
  const close = useCallback(() => {
    const typed = qRef.current.trim();
    if (typed && !actedRef.current) track("action", "search-drop", typed.slice(0, MAX_Q));
    onCloseRef.current();
  }, []);

  const commit = (it: Item) => {
    const typed = qRef.current.trim();
    // A name (the Analyze row, a watchlist hit, a recent search) is a search
    // that was served. Anything else is a destination: navigation that happens
    // to start with typing.
    const isName = it.kind !== "action";
    if (typed) track("action", isName ? "search-run" : "search-nav", typed.slice(0, MAX_Q));
    actedRef.current = true;
    haptic("light");
    if (isName) {
      const query = it.kind === "watch" ? watchQuery(it.item) : it.query;
      const next = pushRecent(readRecent(), query);
      writeRecent(next);
      setRecent(next);
      onAnalyze(query);
    } else {
      it.action.run();
    }
    onCloseRef.current();
  };

  const groups = buildGroups(q, actions, watchlist, recent);
  const flat = groups.flatMap((g) => g.items);
  const active = Math.min(sel, Math.max(flat.length - 1, 0));
  const optionId = (i: number) => `${listId}-o${i}`;
  // With a keyboard the highlight says what Enter opens. On a touch screen it
  // only earns its place once there's a query (it's what "Go" will open).
  const showActive = fine || !!q.trim();

  // Keyboard moves scroll the active row into view; the mouse doesn't.
  const keyNav = useRef(false);
  useEffect(() => {
    if (!open || !keyNav.current) return;
    keyNav.current = false;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      keyNav.current = true;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setSel((active + d + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flat[active];
      if (it) commit(it);
    }
    // Escape is the Sheet's: it calls `close`, which records an abandoned query.
  };

  const clearRecent = () => { writeRecent([]); setRecent([]); setSel(0); };

  // Where each group's rows start in the flat, keyboard-navigable order.
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0));
  return (
    <Sheet
      open={open}
      onClose={close}
      full
      labelledBy={titleId}
      title={
        <div className={s.field}>
          <span id={titleId} className="sr-only">Search</span>
          <Search className={s.fieldIcon} aria-hidden="true" />
          <input
            className={s.input}
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search a name, or go to…"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? optionId(active) : undefined}
            aria-label="Search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={MAX_Q * 2}
          />
          {q && (
            <button type="button" className={s.clear} aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(""); setSel(0); }}>
              <CircleX aria-hidden="true" />
            </button>
          )}
        </div>
      }
      footer={fine ? (
        <div className={s.hints} aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>↵</kbd> to open</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      ) : undefined}
    >
      <div id={listId} role="listbox" aria-label="Results" className={s.results}>
        {groups.map((g, gi) => (
          <div key={g.id} role="group" aria-labelledby={`${listId}-${g.id}`} className={s.group}>
            <div className={s.groupHead}>
              <span id={`${listId}-${g.id}`}>{g.title}</span>
              {g.clear && <button type="button" className={s.groupAction} onClick={clearRecent}>Clear</button>}
            </div>
            {g.items.map((it, ii) => {
              const i = starts[gi] + ii;
              const on = i === active;
              return (
                <button
                  key={it.id}
                  id={optionId(i)}
                  type="button"
                  role="option"
                  aria-selected={on}
                  tabIndex={-1}
                  className={s.item}
                  data-active={(on && showActive) || undefined}
                  onPointerMove={(e) => { if (e.pointerType === "mouse" && i !== active) setSel(i); }}
                  onClick={() => commit(it)}
                >
                  <ItemBody it={it} />
                  {on && fine && <CornerDownLeft className={s.enter} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
        {!flat.length && (
          <div className={s.empty}>
            <p className={s.emptyTitle}>No matches for “{q.trim()}”</p>
            <p className={s.emptyBody}>Try a ticker like NVDA, a pair like EUR/USD, or a company name.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ItemBody({ it }: { it: Item }) {
  switch (it.kind) {
    case "analyze": {
      const d = display(it.query);
      return (
        <>
          <span className={`${s.icon} ${s.iconAccent}`} aria-hidden="true"><ScanSearch /></span>
          <span className={s.text}>
            <span className={s.label}>Analyze {d.ticker ? <span className="ui-ticker">{d.text}</span> : <>“{d.text}”</>}</span>
            <span className={s.sub}>{it.tracked ? "On your watchlist · run the lenses" : "Eight-lens deep dive"}</span>
          </span>
        </>
      );
    }
    case "watch":
      return (
        <>
          <span className={s.icon} aria-hidden="true"><Bookmark /></span>
          <span className={s.text}>
            <span className={s.label}><span className="ui-ticker">{it.item.symbol}</span></span>
            <span className={s.sub}>{mapClass(it.item.asset_class)}</span>
          </span>
          <span className={s.hint}>Analyze</span>
        </>
      );
    case "recent": {
      const d = display(it.query);
      return (
        <>
          <span className={s.icon} aria-hidden="true"><Clock /></span>
          <span className={s.text}><span className={s.label}>{d.ticker ? <span className="ui-ticker">{d.text}</span> : d.text}</span></span>
          <span className={s.hint}>Analyze</span>
        </>
      );
    }
    case "action":
      return (
        <>
          <span className={s.icon} aria-hidden="true">{it.action.icon ?? ACTION_ICON[it.action.id] ?? <ArrowRight />}</span>
          <span className={s.text}><span className={s.label}>{it.action.label}</span></span>
          {it.action.hint && <span className={s.hint}>{it.action.hint}</span>}
        </>
      );
  }
}
