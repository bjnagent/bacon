"use client";

import { useMemo, useState } from "react";
import { Segmented, Button } from "@/components/ui";
import { CallHeader, CallLine, callList } from "./CallLine";
import { CallSheet } from "./CallSheet";
import { FILTERS, filterCalls, filterCounts, type CallFilter, type RecordCall } from "./recordModel";
import s from "./CallList.module.css";

// The account's calls, newest first, with a reading filter. The filter only
// changes what this list shows — the stats and chart above are always built
// from every call, so choosing "Hits" can't flatter anything.

const PAGE = 25;

const EMPTY_COPY: Record<CallFilter, string> = {
  all: "No calls yet.",
  open: "Nothing open — every call on record has settled.",
  graded: "Nothing graded yet. Calls are first priced 30 days after they're filed.",
  hits: "No hits yet.",
  misses: "No misses yet.",
};

export function CallList({ calls, today, onAnalyze }: {
  calls: RecordCall[];
  today: string;
  onAnalyze?: (c: RecordCall) => void;
}) {
  const [filter, setFilter] = useState<CallFilter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => filterCounts(calls), [calls]);
  const shown = useMemo(() => filterCalls(calls, filter), [calls, filter]);
  const visible = shown.slice(0, limit);
  const open = openId ? calls.find((c) => c.id === openId) ?? null : null;

  return (
    <div className={s.wrap}>
      <div className={s.filters}>
        <Segmented
          label="Show calls"
          value={filter}
          onChange={(v) => { setFilter(v); setLimit(PAGE); }}
          options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          block
        />
      </div>
      <p className={s.count} aria-live="polite">
        {filter === "all"
          ? `${counts.all} call${counts.all === 1 ? "" : "s"} · ${counts.open} open · ${counts.graded} graded`
          : `${shown.length} of ${counts.all} call${counts.all === 1 ? "" : "s"}`}
      </p>

      {visible.length === 0 ? (
        <div className={s.empty}>{EMPTY_COPY[filter]}</div>
      ) : (
        <div className={callList.list}>
          <div className={callList.headRow}><CallHeader chevron /></div>
          <ul>
            {visible.map((c) => (
              <li key={c.id} className={callList.item}>
                <button
                  type="button"
                  className={callList.rowBtn}
                  onClick={() => setOpenId(c.id)}
                  aria-haspopup="dialog"
                >
                  <CallLine c={c} today={today} chevron />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown.length > visible.length && (
        <Button variant="ghost" block onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, shown.length - visible.length)} more
        </Button>
      )}

      <CallSheet call={open} today={today} onClose={() => setOpenId(null)} onAnalyze={onAnalyze} />
    </div>
  );
}
