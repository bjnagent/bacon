"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Plus, Check, WifiOff, RefreshCw } from "lucide-react";
import { Section, Button, Chip, Callout, EmptyState, Sheet, toast } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { apiFetch, ApiError, useApi } from "@/lib/client/api";
import { invalidate } from "@/lib/clientCache";
import { openPaywall } from "@/lib/client/paywall";
import { relTime } from "@/lib/lenses";
import type { ScoutPickRow, ThemeRow, WatchRow } from "@/lib/types";
import { NamesList, NamesSkeleton } from "./NamesList";
import NameSheet from "./NameSheet";
import AddNameSheet, { useWatchlistCap } from "./AddNameSheet";
import FreshFinds from "./FreshFinds";
import ThemesSection, { type SettingsData } from "./ThemesSection";
import { useQuotes } from "./useQuotes";
import { useEvent } from "./useEvent";
import { POPULAR, plural, quoteKey, type NameRow } from "./logic";
import s from "./Watchlist.module.css";

type Editable = Pick<WatchRow, "thesis" | "conviction" | "note">;

/**
 * The names half of the Watchlist tab. Membership comes from the shell
 * (app.watchlist — shared with every "Track" button in the app); this pane
 * layers local edits on top until the next refetch confirms them.
 */
export default function NamesPane({ addOpen, onAdd, onAddClose, refreshNonce }: {
  addOpen: boolean;
  onAdd: () => void;
  onAddClose: () => void;
  refreshNonce: number;
}) {
  const app = useApp();
  const cap = useWatchlistCap();

  // Field-level edits (thesis, conviction, note, a fresh update) since the
  // shell last fetched the list. Cleared after a refetch, which then carries them.
  const [patches, setPatches] = useState<Record<string, Partial<WatchRow>>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const rows: NameRow[] = useMemo(
    () => app.watchlist.map((w) => ({ ...(w as NameRow), ...patches[w.id] })),
    [app.watchlist, patches],
  );
  const open = openId ? rows.find((r) => r.id === openId) ?? null : null;

  const quoteKeys = useMemo(() => rows.map((r) => quoteKey(r.symbol, r.asset_class)).filter((k): k is string => !!k), [rows]);
  const { quotes, refresh: refreshQuotes } = useQuotes(quoteKeys);

  const themesApi = useApi<{ themes?: ThemeRow[] }>("/api/themes", 60_000);
  const settingsApi = useApi<SettingsData>("/api/settings", 60_000);
  const picksApi = useApi<{ picks?: ScoutPickRow[] }>("/api/scout", 60_000);

  // Quiet refresh when the tab comes back after a while (the screen bumps the
  // nonce). Nothing flashes: lists keep their data until the new copy lands.
  const firstNonce = useRef(refreshNonce);
  const { refreshWatchlist } = app;
  const { refresh: refreshPicks } = picksApi;
  useEffect(() => {
    if (refreshNonce === firstNonce.current) return;
    void (async () => {
      await refreshWatchlist();
      setPatches({});
    })();
    void refreshQuotes();
    void refreshPicks();
  }, [refreshNonce, refreshWatchlist, refreshQuotes, refreshPicks]);

  const patchRow = useCallback((id: string, p: Partial<WatchRow>) => {
    setPatches((all) => ({ ...all, [id]: { ...all[id], ...p } }));
  }, []);

  const save = useCallback(async (row: NameRow, p: Partial<Editable>, what: string) => {
    const before: Partial<WatchRow> = {};
    for (const k of Object.keys(p) as (keyof Editable)[]) (before as Record<string, unknown>)[k] = row[k];
    patchRow(row.id, p);
    try {
      await apiFetch(`/api/watchlist/${row.id}`, { method: "PATCH", body: p });
      invalidate("/api/watchlist");
      toast(what);
      return true;
    } catch (err) {
      patchRow(row.id, before);
      toast.error(err instanceof Error ? err.message : "Couldn't save that — try again.");
      return false;
    }
  }, [patchRow]);

  type Outcome = "ok" | "fail" | "upgrade";
  const refreshUpdate = useCallback(async (row: NameRow, quiet = false): Promise<Outcome> => {
    if (refreshing[row.id]) return "fail";
    setRefreshing((m) => ({ ...m, [row.id]: true }));
    try {
      const d = await apiFetch<{ update?: { update: string; watch: string; lean: string | null; leanReason: string; last_scan_at: string } }>(
        "/api/track-update", { body: { id: row.id, symbol: row.symbol, assetClass: row.asset_class } },
      );
      if (!d.update) return "fail";
      patchRow(row.id, {
        update_text: d.update.update, watch_text: d.update.watch, lean: d.update.lean,
        lean_reason: d.update.leanReason, status: "ok", last_scan_at: d.update.last_scan_at,
      });
      invalidate("/api/watchlist");
      if (!quiet) toast(`${row.symbol} is up to date`);
      return "ok";
    } catch (err) {
      if (err instanceof ApiError && err.isUpgrade) return "upgrade"; // the paywall is already up
      if (err instanceof ApiError && err.status >= 500) patchRow(row.id, { status: "error" });
      if (!quiet) toast.error(err instanceof Error ? err.message : "Couldn't refresh that update.");
      return "fail";
    } finally {
      setRefreshing((m) => { const n = { ...m }; delete n[row.id]; return n; });
      if (!quiet) void app.refreshMe(); // the "refreshes left" count moved (or was refunded)
    }
  }, [refreshing, patchRow, app]);

  // "Refresh all": the stalest names first, never more than the refreshes left
  // — the nightly check already covers everything, so this is a top-up.
  const [bulkOpen, setBulkOpen] = useState(false);
  const closeBulk = useEvent(() => setBulkOpen(false));
  const closeName = useEvent(() => setOpenId(null));
  const left = app.remaining("update");
  const realRows = rows.filter((r) => !r.id.startsWith("tmp-"));
  const bulkTargets = [...realRows]
    .sort((a, b) => (a.last_scan_at ?? "").localeCompare(b.last_scan_at ?? ""))
    .slice(0, left == null ? realRows.length : left);
  const anyRefreshing = Object.keys(refreshing).length > 0;
  const lastChecked = realRows.reduce<string | null>((m, r) => (r.last_scan_at && (!m || r.last_scan_at > m) ? r.last_scan_at : m), null);

  const refreshAll = async () => {
    setBulkOpen(false);
    const targets = bulkTargets;
    let ok = 0, failed = 0;
    // Two at a time: quick enough, and gentle on the provider and the daily cap.
    for (let i = 0; i < targets.length; i += 2) {
      const res = await Promise.all(targets.slice(i, i + 2).map((r) => refreshUpdate(r, true)));
      ok += res.filter((x) => x === "ok").length;
      failed += res.filter((x) => x === "fail").length;
      if (res.includes("upgrade")) break;
    }
    void app.refreshMe();
    if (ok) toast(`${plural(ok, "name")} refreshed${failed ? ` · ${failed} couldn't be` : ""}`);
    else if (failed) toast.error("Couldn't refresh those — try again in a minute.");
  };

  // Undo after removal: re-track, then restore what the member had written
  // once the new row (with its new id) arrives from the server.
  const restoring = useRef<{ symbol: string; fields: Partial<Editable> } | null>(null);
  useEffect(() => {
    const r = restoring.current;
    if (!r) return;
    const item = app.watchlist.find((w) => w.symbol === r.symbol && !w.id.startsWith("tmp-"));
    if (!item) return;
    restoring.current = null;
    if (Object.keys(r.fields).length) {
      void apiFetch(`/api/watchlist/${item.id}`, { method: "PATCH", body: r.fields })
        .then(() => { patchRow(item.id, r.fields); invalidate("/api/watchlist"); })
        .catch(() => {});
    }
  }, [app.watchlist, patchRow]);

  // The Undo action runs seconds later, after the shell's watchlist (and with
  // it trackSymbol, which skips names it believes are already tracked) has
  // moved on — so it must call the CURRENT shell API, not the one captured
  // when the toast was raised.
  const appRef = useRef(app);
  useEffect(() => { appRef.current = app; }, [app]);

  const remove = useCallback(async (row: NameRow) => {
    const ok = await app.untrackSymbol(row.symbol);
    if (!ok) return;
    setOpenId(null);
    const fields: Partial<Editable> = {};
    if (row.thesis) fields.thesis = row.thesis;
    if (row.note) fields.note = row.note;
    if (row.conviction) fields.conviction = row.conviction;
    toast(`${row.symbol} removed`, {
      action: {
        label: "Undo",
        run: () => {
          restoring.current = { symbol: row.symbol, fields };
          void appRef.current.trackSymbol(row.symbol, row.asset_class);
        },
      },
    });
  }, [app]);

  const themeLabels = (themesApi.data?.themes ?? []).map((t) => t.label);
  const loading = !app.watchlistLoaded;
  const empty = app.watchlistLoaded && rows.length === 0;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  const names = loading ? (
    <NamesSkeleton />
  ) : empty ? (
    offline ? (
      <Callout tone="warn" icon={<WifiOff />}>
        You&apos;re offline, so your watchlist can&apos;t load right now.
        <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => void app.refreshWatchlist()}>Try again</Button></div>
      </Callout>
    ) : (
      <div className="ui-card">
        <EmptyState
          icon={<Bookmark />}
          title="Start your watchlist"
          body="Bacon re-reads every name you track each night and tells you what changed — the lean, the latest development and what to watch next."
          actions={<Button variant="primary" icon={<Plus />} onClick={onAdd}>Add a name</Button>}
        />
        <div className={s.start}>
          <p className={`t-caption ${s.startLabel}`}>Or start with a popular one</p>
          <div className={s.startChips}>
            {POPULAR.map((p) => {
              const on = app.isTracked(p.symbol);
              return (
                <Chip key={p.symbol} pressed={on} icon={on ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />} onClick={() => { if (!on) void app.trackSymbol(p.symbol, p.cls); }}>
                  {p.symbol}
                </Chip>
              );
            })}
          </div>
        </div>
      </div>
    )
  ) : (
    <div>
      <div className={s.listBar}>
        <span className="t-caption">{anyRefreshing ? "Refreshing…" : lastChecked ? `Last checked ${relTime(lastChecked)}` : "Not checked yet"}</span>
        <Button size="sm" variant="ghost" icon={<RefreshCw />} disabled={anyRefreshing || realRows.length === 0} onClick={() => setBulkOpen(true)}>Refresh all</Button>
      </div>
      <NamesList rows={rows} quotes={quotes} refreshing={refreshing} onOpen={setOpenId} />
      <p className={s.listFoot}>
        Crypto is live via Coinbase; stocks and ETFs show the last close (delayed). No prices for FX, commodities or rates.
        {cap.max != null && ` ${cap.used} of ${cap.max} names on your plan.`}
      </p>
    </div>
  );

  return (
    <>
      <div className={s.layout}>
        <div className={s.areaNames}><Section>{names}</Section></div>
        <div className={s.areaFinds}><FreshFinds picksApi={picksApi} settingsApi={settingsApi} themes={themeLabels} /></div>
        <div className={s.areaThemes}><ThemesSection themesApi={themesApi} settingsApi={settingsApi} /></div>
      </div>

      {open && (
        <NameSheet
          key={open.id}
          row={open}
          quote={(() => { const k = quoteKey(open.symbol, open.asset_class); return k ? quotes[k] ?? null : null; })()}
          refreshing={!!refreshing[open.id]}
          onClose={closeName}
          onRefresh={() => void refreshUpdate(open)}
          onSave={(p, what) => save(open, p, what)}
          onRemove={() => remove(open)}
        />
      )}
      <AddNameSheet open={addOpen} onClose={onAddClose} />
      <Sheet
        open={bulkOpen} onClose={closeBulk} title="Refresh every name?"
        footer={left === 0 ? (
          <div className={s.confirmActions}>
            <Button onClick={() => setBulkOpen(false)}>Not now</Button>
            <Button variant="primary" onClick={() => { setBulkOpen(false); openPaywall({ reason: "limit", meter: "update", plan: app.me?.plan.plan, suggested: "pro", resetsAt: app.me?.plan.resetsAt }); }}>See plans</Button>
          </div>
        ) : (
          <div className={s.confirmActions}>
            <Button onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={<RefreshCw />} onClick={() => void refreshAll()}>Refresh {plural(bulkTargets.length, "name")}</Button>
          </div>
        )}
      >
        <div className="stack">
          <p className="t-callout">Bacon already re-reads every name each night. Refreshing now gets the latest read immediately and uses one refresh per name.</p>
          {left === 0 ? (
            <Callout tone="warn">You have no refreshes left this month.</Callout>
          ) : left != null && bulkTargets.length < realRows.length ? (
            <Callout>You have {plural(left, "refresh", "refreshes")} left this month, so the {plural(bulkTargets.length, "name")} checked longest ago will be refreshed.</Callout>
          ) : left != null ? (
            <p className="t-caption">Uses {bulkTargets.length} of your {left} refreshes left this month.</p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
