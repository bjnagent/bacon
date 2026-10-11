"use client";

import { useState } from "react";
import { RefreshCw, ScanSearch, MessageCircle, Trash2 } from "lucide-react";
import { Sheet, Badge, Delta, Button } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { haptic } from "@/lib/native";
import { relTime } from "@/lib/lenses";
import { METER_LABEL } from "@/lib/plans";
import ChartLink from "./ChartLink";
import { useEvent } from "./useEvent";
import { CONVICTION_LABELS, formatPrice, leanBadge, quoteDetail, quoteKey, quoteLabel, type NameRow, type Quote } from "./logic";
import s from "./Watchlist.module.css";

type Editable = { thesis?: string; conviction?: number; note?: string };

/**
 * Everything about one tracked name: the overnight read, what to watch, the
 * member's own thesis, and the actions that hang off it. Opens as a bottom
 * sheet on phones and a side panel on desktop.
 */
export default function NameSheet({ row, quote, refreshing, onClose, onRefresh, onSave, onRemove }: {
  row: NameRow;
  quote: Quote | null;
  refreshing: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSave: (patch: Editable, what: string) => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  const app = useApp();
  // Drafts start from the row when the sheet opens (it mounts fresh each time).
  const [thesis, setThesis] = useState(row.thesis ?? "");
  const [note, setNote] = useState(row.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const lean = leanBadge(row.lean);
  const checked = relTime(row.last_scan_at);
  const conviction = row.conviction ?? 0;
  const left = app.remaining("update");
  const sym = row.symbol;

  const saveText = (field: "thesis" | "note", value: string) => {
    if (value === (row[field] ?? "")) return;
    void onSave({ [field]: value }, field === "thesis" ? "Thesis saved" : "Note saved");
  };
  const setConviction = (n: number) => {
    if (n === conviction) return;
    haptic("selection");
    void onSave({ conviction: n }, `Conviction: ${CONVICTION_LABELS[n].toLowerCase()}`);
  };

  // Escape, the backdrop and the close button can all dismiss the sheet without
  // a reliable blur on the field being edited — save any changed draft first.
  const close = useEvent(() => {
    saveText("thesis", thesis);
    saveText("note", note);
    onClose();
  });

  const ask = () => {
    close();
    app.openChat({
      kind: "tracked", asset: sym, cls: row.asset_class, thesis: thesis || undefined, update: row.update_text || undefined,
      title: sym, sub: "Tracked name",
      notes: [row.lean_reason && `Overnight lean: ${lean.label} — ${row.lean_reason}`, row.watch_text && `What to watch: ${row.watch_text}`].filter(Boolean).join("\n") || undefined,
    });
  };
  const analyze = () => { close(); app.openAnalyze({ asset: sym, cls: row.asset_class, run: true }); };

  return (
    <Sheet open onClose={close} title={sym} variant="side">
      <div className="stack-lg">
        <div className={s.dQuote}>
          <div className={s.dClass}>{row.asset_class}</div>
          {quote ? (
            <>
              <div className={s.dPriceNum}>{formatPrice(quote.price)}</div>
              <div className={s.dMove}>
                <span className={s.src}>{quoteLabel(quote)}</span>
                {quote.changePct != null && <Delta pct={quote.changePct} />}
                <span className={s.src}>· {quoteDetail(quote)}</span>
              </div>
            </>
          ) : quoteKey(sym, row.asset_class) == null ? (
            <div className={s.src}>No price shown for this kind of instrument — our providers can&apos;t quote it reliably.</div>
          ) : null}
        </div>

        <div className={s.leanRow}>
          <Badge tone={lean.tone}>{lean.label}</Badge>
          <div className={s.leanText}>{row.lean_reason || (row.lean ? "No reason given with this read." : "Bacon hasn't read this name yet. The first read lands with tonight's check — or refresh now.")}</div>
        </div>

        <div className={s.block}>
          <div className={s.blockHead}>
            <span className={s.blockLabel}>Latest update</span>
            <span className={s.blockMeta}>{refreshing ? "Checking now…" : checked ? `Checked ${checked}` : "Not checked yet"}</span>
          </div>
          <p className={`${s.blockText}${row.update_text ? "" : ` ${s.isMuted}`}`} aria-live="polite">
            {row.update_text || (row.status === "error" ? "The last check failed. Try a refresh." : "Nothing yet.")}
          </p>
          {row.status === "error" && row.update_text && <p className="t-caption">The most recent check failed; this is the previous read.</p>}
        </div>

        {row.watch_text && (
          <div className={s.block}>
            <span className={s.blockLabel}>What to watch</span>
            <p className={s.blockText}>{row.watch_text}</p>
          </div>
        )}

        <div className={s.refreshRow}>
          <Button variant="tonal" block icon={<RefreshCw />} loading={refreshing} onClick={onRefresh}>
            {refreshing ? "Refreshing…" : "Refresh update"}
          </Button>
          <span className={s.refreshHint}>
            {left == null ? "Uses one refresh from your plan." : left === 0 ? "No refreshes left this month — upgrade for more." : `Uses one refresh · ${left} ${left === 1 ? METER_LABEL.update.one : METER_LABEL.update.many} left this month`}
          </span>
        </div>

        <div className={s.actionGrid}>
          <Button variant="primary" icon={<ScanSearch />} onClick={analyze}>Analyze</Button>
          <Button icon={<MessageCircle />} onClick={ask}>Ask Bacon</Button>
        </div>
        <ChartLink sym={sym} />

        <hr className={s.divider} />

        <div className="ui-field">
          <label className="ui-label" htmlFor={`thesis-${row.id}`}>Your thesis</label>
          <textarea
            id={`thesis-${row.id}`} className="ui-textarea" rows={3} maxLength={2000}
            placeholder="Why might this work? What would prove you wrong?"
            value={thesis} onChange={(e) => setThesis(e.target.value)} onBlur={() => saveText("thesis", thesis)}
          />
        </div>

        <div className="ui-field">
          <span className="ui-label" id={`conv-${row.id}`}>Conviction</span>
          <div className={s.conv} role="group" aria-labelledby={`conv-${row.id}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n} type="button" className={s.convBtn} data-on={conviction >= n}
                aria-pressed={conviction === n} aria-label={`${n} of 5 — ${CONVICTION_LABELS[n]}`}
                onClick={() => setConviction(n)}
              >
                <span className={s.convDot} />
              </button>
            ))}
            <span className={s.convLabel}>{CONVICTION_LABELS[conviction] ?? "Not set"}</span>
          </div>
        </div>

        <div className="ui-field">
          <label className="ui-label" htmlFor={`note-${row.id}`}>Position note</label>
          <input
            id={`note-${row.id}`} className="ui-input" maxLength={500}
            placeholder="Size, entry zone, stop, review date…"
            value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => saveText("note", note)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </div>

        {confirming ? (
          <div className={s.confirm} role="alertdialog" aria-label={`Remove ${sym}?`}>
            <div className={s.confirmText}>Stop tracking <strong>{sym}</strong>? Its thesis and notes go with it.</div>
            <div className={s.confirmActions}>
              <Button onClick={() => setConfirming(false)} disabled={removing}>Cancel</Button>
              <Button variant="danger" loading={removing} onClick={async () => { setRemoving(true); await onRemove(); setRemoving(false); }}>Remove</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" block icon={<Trash2 />} className={s.removeBtn} onClick={() => setConfirming(true)}>Remove from watchlist</Button>
        )}

        <p className="t-caption" style={{ textAlign: "center" }}>Research, not investment advice.</p>
      </div>
    </Sheet>
  );
}
