import { LENSES } from "@/lib/lenses";

// The wavy bacon-rasher logo: six stripes = the six lenses. Ported from the artifact.
export default function BaconMark({ size = 40 }: { size?: number }) {
  const wave = (y: number) => `M6 ${y} C 16 ${y - 5}, 24 ${y + 5}, 32 ${y} C 40 ${y - 5}, 48 ${y + 5}, 58 ${y}`;
  const rows = LENSES.map((l, i) => ({ hue: l.hue, y: 18 + i * 5.6 }));
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="pr-prism" aria-hidden="true">
      <g transform="rotate(-14 32 32)" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {rows.map((r, i) => <path key={"e" + i} d={wave(r.y)} stroke="#1A1712" strokeOpacity="0.26" strokeWidth="5.8" />)}
        {rows.map((r, i) => <path key={"s" + i} d={wave(r.y)} stroke={r.hue} strokeWidth="4.2" />)}
      </g>
    </svg>
  );
}
