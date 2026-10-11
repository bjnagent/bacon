"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Callout } from "@/components/ui";
import { auditFigures } from "@/lib/verify";
import type { BriefItem } from "./brief";
import s from "./Today.module.css";

const PREVIEW = 3;

/**
 * The verification gate, surfaced: every hard figure across today's ideas that
 * neither cites a source nor declares itself an estimate. Only appears when
 * there is something to check — a permanent "all clear" panel would train
 * people to scroll past it on the day it matters.
 */
export default function DataCheck({ items }: { items: BriefItem[] }) {
  const [open, setOpen] = useState(false);
  const check = useMemo(() => auditFigures(items.map((o) => `${o.thesis} ${o.signals}`).join(" \n ")), [items]);
  if (!check.flagged.length) return null;

  const n = check.flagged.length;
  const shown = open ? check.flagged : check.flagged.slice(0, PREVIEW);
  return (
    <Callout tone="warn" icon={<TriangleAlert />}>
      <div className={s.dcHead}>
        <strong>Data check</strong>
        <span>
          {n} of {check.total} hard figure{check.total === 1 ? "" : "s"} in today&apos;s ideas {n === 1 ? "is" : "are"} stated as fact without a source
          {check.estimates > 0 && <span className={s.dcSum}> · {check.estimates} more labelled as estimates</span>}
        </span>
      </div>
      <ul className={s.dcList}>
        {shown.map((f, i) => <li key={i}><strong>{f.figure}</strong> — {f.snippet}</li>)}
      </ul>
      {n > PREVIEW && (
        <button type="button" className={s.dcMore} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Show fewer" : `Show all ${n}`}
        </button>
      )}
      <p className={s.dcFoot}>Facts should carry a source; labelled estimates are Bacon&apos;s own calls. These are neither — verify before acting.</p>
    </Callout>
  );
}
