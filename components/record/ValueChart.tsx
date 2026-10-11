"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import s from "./ValueChart.module.css";
import { chartGeometry, compactUsd, fmtDate, fmtDay, nearestIndex, pct, signedUsd, signedUsd0, usd0, type ValuePoint } from "./recordModel";

// $10K in every graded call vs the same money in SPY, drawn by hand in SVG: two
// lines and a baseline don't need a chart library, and drawing it ourselves
// keeps every colour on the theme tokens (CSS Module classes, so dark mode is
// free). Y is cumulative gain or loss rather than raw value: the stake grows by
// $10K a call, so raw value is two near-identical staircases and the gap — the
// thing worth seeing — disappears into the scale.
//
// One hover/tap/arrow-key readout lists both series at the nearest filing date;
// every value it shows is also stated in the legend or the calls list below.

const DEFAULT_WIDTH = 640;

export function ValueChart({ points, subject = "Bacon's calls" }: { points: ValuePoint[]; subject?: string }) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => { if (e) setWidth(Math.max(240, Math.round(e.contentRect.width))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 520 ? 196 : 240;
  const g = useMemo(() => chartGeometry(points, width, height), [points, width, height]);
  const last = points[points.length - 1];
  if (!last || points.length < 2) return null;

  const gain = last.value - last.invested;
  const spyGain = last.spyValue - last.invested;
  const ret = (gain / last.invested) * 100;
  const spyRet = (spyGain / last.invested) * 100;
  const first = points[0];

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(g.xs, e.clientX - rect.left));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = points.length;
    const cur = active ?? n - 1;
    const next = e.key === "ArrowLeft" ? Math.max(0, cur - 1)
      : e.key === "ArrowRight" ? Math.min(n - 1, cur + 1)
        : e.key === "Home" ? 0
          : e.key === "End" ? n - 1
            : e.key === "Escape" ? null : undefined;
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
  };

  const ap = active != null ? points[active] : null;
  const ax = active != null ? g.xs[active] : 0;
  // Keep the readout inside the plot: it centres on the crosshair until it
  // would spill past an edge.
  const tipLeft = Math.min(Math.max(ax, 92), width - 92);

  const xLabels = width >= 480 && points.length >= 3
    ? [0, Math.floor((points.length - 1) / 2), points.length - 1]
    : [0, points.length - 1];

  return (
    <figure className={s.fig}>
      <figcaption className={s.head}>
        <div className={s.legend}>
          <div className={s.key}>
            <span className={`${s.swatch} ${s.swatchCalls}`} aria-hidden="true" />
            <span className={s.keyText}>
              <span className={s.keyLabel}>{subject}</span>
              <span className={`${s.keyValue} t-num`}>{usd0(last.value)}</span>
              <span className={`${s.keyDelta} t-num ${gain >= 0 ? "t-pos" : "t-neg"}`}>{signedUsd0(gain)} · {pct(ret)}</span>
            </span>
          </div>
          <div className={s.key}>
            <span className={`${s.swatch} ${s.swatchSpy}`} aria-hidden="true" />
            <span className={s.keyText}>
              <span className={s.keyLabel}>Same money in SPY</span>
              <span className={`${s.keyValue} t-num`}>{usd0(last.spyValue)}</span>
              <span className={`${s.keyDelta} t-num ${spyGain >= 0 ? "t-pos" : "t-neg"}`}>{signedUsd0(spyGain)} · {pct(spyRet)}</span>
            </span>
          </div>
        </div>
        <p className={s.staked}>
          {usd0(last.invested)} staked across {last.calls} call{last.calls === 1 ? "" : "s"}, {fmtDay(first.date)} – {fmtDate(last.date)}
        </p>
      </figcaption>

      <div
        ref={wrapRef}
        className={s.plot}
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`Chart: gain on ${subject.toLowerCase()} vs SPY by filing date. Use the arrow keys to read each date.`}
        onKeyDown={onKey}
        onFocus={() => setActive((a) => a ?? points.length - 1)}
        onBlur={() => setActive(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={s.svg}
          role="img"
          aria-labelledby={`${id}-t ${id}-d`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}
        >
          <title id={`${id}-t`}>{`${subject} vs the same money in SPY`}</title>
          <desc id={`${id}-d`}>
            {`Cumulative gain on a hypothetical $10,000 in each of ${last.calls} graded calls filed from ${fmtDate(first.date)} to ${fmtDate(last.date)}: ${signedUsd(gain)} on ${usd0(last.invested)} (${pct(ret)}), against ${signedUsd(spyGain)} (${pct(spyRet)}) for the same money in SPY over the same windows.`}
          </desc>

          {g.yTicks.map((t) => (
            <g key={t.value}>
              <line x1={g.plot.left} x2={g.plot.right} y1={t.y} y2={t.y} className={t.value === 0 ? s.zero : s.grid} />
              <text x={g.plot.left - 8} y={t.y} className={s.yLabel} textAnchor="end" dominantBaseline="middle">{compactUsd(t.value)}</text>
            </g>
          ))}
          {xLabels.map((i, n) => (
            <text
              key={i}
              x={g.xs[i]}
              y={height - 6}
              className={s.xLabel}
              textAnchor={n === 0 ? "start" : n === xLabels.length - 1 ? "end" : "middle"}
            >
              {fmtDay(points[i].date)}
            </text>
          ))}

          <path d={g.callsArea} className={s.area} />
          <path d={g.spyPath} className={s.spyLine} />
          <path d={g.callsPath} className={s.callsLine} />

          {active != null ? (
            <g aria-hidden="true">
              <line x1={ax} x2={ax} y1={g.plot.top} y2={g.plot.bottom} className={s.crosshair} />
              <circle cx={ax} cy={g.y(g.spyGain[active])} r={4.5} className={s.spyDot} />
              <circle cx={ax} cy={g.y(g.gain[active])} r={4.5} className={s.callsDot} />
            </g>
          ) : (
            <g aria-hidden="true">
              <circle cx={g.xs[g.xs.length - 1]} cy={g.y(spyGain)} r={4} className={s.spyDot} />
              <circle cx={g.xs[g.xs.length - 1]} cy={g.y(gain)} r={4} className={s.callsDot} />
            </g>
          )}
        </svg>

        {ap && active != null && (
          <div className={s.tip} style={{ left: tipLeft }} aria-live="polite">
            <div className={s.tipDate}>Filed through {fmtDate(ap.date)}</div>
            <div className={s.tipRow}>
              <span className={`${s.tipKey} ${s.swatchCalls}`} aria-hidden="true" />
              <strong className="t-num">{signedUsd0(g.gain[active])}</strong>
              <span className={s.tipName}>{subject}</span>
            </div>
            <div className={s.tipRow}>
              <span className={`${s.tipKey} ${s.swatchSpy}`} aria-hidden="true" />
              <strong className="t-num">{signedUsd0(g.spyGain[active])}</strong>
              <span className={s.tipName}>SPY</span>
            </div>
            <div className={s.tipFoot}>{ap.calls} call{ap.calls === 1 ? "" : "s"} · {usd0(ap.invested)} staked</div>
          </div>
        )}
      </div>
    </figure>
  );
}
