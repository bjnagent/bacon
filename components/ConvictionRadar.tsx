import { LENSES, STANCES, type LensKey, type StanceKey } from "@/lib/lenses";

// SVG convergence gauge: a hexagonal radar whose shape shows how the six lens
// stances line up. Ported from the artifact. Not a score — a convergence map.
export default function ConvictionRadar({ stances }: { stances: Partial<Record<LensKey, StanceKey>> }) {
  const cx = 170, cy = 138, R = 86;
  const ang = (i: number) => (-90 + i * 60) * Math.PI / 180;
  const pt = (i: number, frac: number): [number, number] => [cx + R * frac * Math.cos(ang(i)), cy + R * frac * Math.sin(ang(i))];
  const rings = [0.34, 0.67, 1];
  const dataPts = LENSES.map((l, i) => pt(i, STANCES[stances[l.key] || "mixed"].frac));
  const dataPath = dataPts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " Z";
  return (
    <svg viewBox="0 0 340 285" className="pr-radar" role="img" aria-label="Lens stance map">
      {rings.map((r, ri) => <polygon key={ri} points={LENSES.map((_, i) => pt(i, r).join(",")).join(" ")} className="pr-radar-ring" />)}
      {LENSES.map((l, i) => { const p = pt(i, 1); return <line key={l.key} x1={cx} y1={cy} x2={p[0]} y2={p[1]} className="pr-radar-axis" />; })}
      <path d={dataPath} className="pr-radar-poly" />
      {dataPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4.5" style={{ fill: LENSES[i].hue }} />)}
      {LENSES.map((l, i) => { const p = pt(i, 1.22), a = ang(i); const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : (Math.cos(a) > 0 ? "start" : "end"); return <text key={l.key} x={p[0]} y={p[1]} textAnchor={anchor} dominantBaseline="middle" style={{ fill: l.hue }} className="pr-radar-label">{l.name}</text>; })}
    </svg>
  );
}
