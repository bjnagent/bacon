"use client";

import { RefreshCw } from "lucide-react";
import { Badge, Delta, Skeleton } from "@/components/ui";
import { haptic } from "@/lib/native";
import { relTime } from "@/lib/lenses";
import { classShort, formatPrice, leanBadge, quoteKey, quoteLabel, type NameRow, type Quote } from "./logic";
import s from "./Watchlist.module.css";

/** The one-line story under a row: the latest read, or why there isn't one. */
function UpdateLine({ row, refreshing }: { row: NameRow; refreshing: boolean }) {
  if (refreshing) {
    return <span className={`${s.update} ${s.isMuted}`}><RefreshCw className={`${s.inlineIcon} ${s.spin}`} aria-hidden="true" />Reading the latest…</span>;
  }
  if (row.status === "error" && !row.update_text) return <span className={`${s.update} ${s.isErr}`}>Last check failed — open to retry.</span>;
  if (row.update_text) return <span className={s.update}>{row.update_text}</span>;
  return <span className={`${s.update} ${s.isMuted}`}>{row.id.startsWith("tmp-") ? "Adding…" : "First read lands with tonight's check."}</span>;
}

export function NameRowItem({ row, quote, refreshing, onOpen }: { row: NameRow; quote: Quote | null; refreshing: boolean; onOpen: () => void }) {
  const lean = leanBadge(row.lean);
  const checked = relTime(row.last_scan_at);
  const pending = row.id.startsWith("tmp-");
  return (
    <button
      type="button" className={s.row} disabled={pending}
      onClick={() => { haptic("light"); onOpen(); }}
      aria-label={`${row.symbol}, ${lean.label}${quote ? `, ${quoteLabel(quote).toLowerCase()} ${formatPrice(quote.price)}` : ""}`}
    >
      <span className={s.rowHead}>
        <span className={s.sym}>{row.symbol}</span>
        <Badge tone={lean.tone}>{lean.label}</Badge>
      </span>
      <span className={s.price}>{quote ? formatPrice(quote.price) : null}</span>
      <span className={s.meta}>{classShort(row.asset_class)} · {checked ? `checked ${checked}` : "not checked yet"}</span>
      <span className={s.move}>
        {quote && <><span className={s.src}>{quoteLabel(quote)}</span>{quote.changePct != null && <Delta pct={quote.changePct} />}</>}
      </span>
      <UpdateLine row={row} refreshing={refreshing} />
    </button>
  );
}

export function NamesList({ rows, quotes, refreshing, onOpen }: {
  rows: NameRow[];
  quotes: Record<string, Quote>;
  refreshing: Record<string, boolean>;
  onOpen: (id: string) => void;
}) {
  return (
    // Rows stay direct siblings (no list-item wrappers) so the hairline
    // separator selector (.row + .row) applies; each row is a real button.
    <div className={s.list} role="group" aria-label="Tracked names">
      {rows.map((r) => {
        const k = quoteKey(r.symbol, r.asset_class);
        return <NameRowItem key={r.id} row={r} quote={k ? quotes[k] ?? null : null} refreshing={!!refreshing[r.id]} onOpen={() => onOpen(r.id)} />;
      })}
    </div>
  );
}

export function NamesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={s.list} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={s.skelRow}>
          <Skeleton height={18} width="38%" />
          <Skeleton height={18} />
          <Skeleton height={12} width="55%" />
          <Skeleton height={12} width="70%" style={{ justifySelf: "end" }} />
          <div style={{ gridColumn: "1 / -1" }}><Skeleton height={12} width="88%" /></div>
        </div>
      ))}
    </div>
  );
}
