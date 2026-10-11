import { LENSES, STANCES, type LensKey, type StanceKey } from "@/lib/lenses";
import { STANCE_UI, lensVar } from "./model";
import s from "./ConvictionRadar.module.css";

// The convergence gauge: a radar whose SHAPE shows how the lens stances line
// up — a full, even polygon is agreement; a lopsided one is disagreement. Not a
// score, rating or forecast. A lens with no stance yet (still streaming) sits
// at the centre without a marker, so the shape grows as the lenses land.

const W = 360, H = 240, CX = 180, CY = 120, R = 84;
const RINGS = [0.34, 0.67, 1];
const step = 360 / LENSES.length;
const ang = (i: number) => ((-90 + i * step) * Math.PI) / 180;
const pt = (i: number, frac: number): [number, number] => [CX + R * frac * Math.cos(ang(i)), CY + R * frac * Math.sin(ang(i))];

export default function ConvictionRadar({ stances }: { stances: Partial<Record<LensKey, StanceKey>> }) {
  const dataPts = LENSES.map((l, i) => {
    const st = stances[l.key];
    return { key: l.key, st, p: pt(i, st ? STANCES[st].frac : 0) };
  });
  const path = dataPts.map(({ p }, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
  const summary = LENSES.map((l) => `${l.name}: ${stances[l.key] ? STANCE_UI[stances[l.key]!].label : "pending"}`).join(", ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.radar} role="img" aria-label={`Convergence gauge — ${summary}`}>
      {RINGS.map((r) => (
        <polygon key={r} data-part="ring" className={s.ring} points={LENSES.map((_, i) => pt(i, r).join(",")).join(" ")} />
      ))}
      {LENSES.map((l, i) => {
        const p = pt(i, 1);
        return <line key={l.key} data-part="axis" className={s.axis} x1={CX} y1={CY} x2={p[0]} y2={p[1]} />;
      })}
      <path data-part="shape" className={s.shape} d={path} />
      {dataPts.map(({ key, st, p }) => st && (
        <circle key={key} data-part="point" className={s.point} cx={p[0]} cy={p[1]} r={5} style={{ fill: lensVar(key) }} />
      ))}
      {LENSES.map((l, i) => {
        const p = pt(i, 1.2), a = ang(i);
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
        return (
          <text key={l.key} data-part="label" className={s.label} x={p[0]} y={p[1]} textAnchor={anchor} dominantBaseline="middle"
            style={{ fill: stances[l.key] ? undefined : "var(--text-3)" }}>
            {l.name}
          </text>
        );
      })}
    </svg>
  );
}
