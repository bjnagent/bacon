// The Bacon mark: a bold, streaky rasher with a happy little face — warm and
// playful, but legible from 512px down to a 16px favicon and on light or dark
// (a dark halo gives the strip an edge on light backgrounds). Keep in sync with
// app/icon.svg + public/icons/*.
const CREAM = "#F0D8B4", CREAM2 = "#E9C99C", RED = "#C0473A", PINK = "#D98771";
const wave = (y: number) => `M8 ${y} C 18 ${y - 6}, 25 ${y + 6}, 33 ${y} C 41 ${y - 6}, 48 ${y + 6}, 56 ${y}`;
const BANDS = [
  { y: 25, c: CREAM },   // fatty top edge
  { y: 30.5, c: RED },   // meat
  { y: 36, c: PINK },    // marbling
  { y: 41.5, c: RED },   // meat
  { y: 47, c: CREAM2 },  // fatty bottom edge
];

export default function BaconMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="pr-prism" aria-hidden="true">
      <g transform="rotate(-12 32 36)">
        {BANDS.map((b, i) => <path key={"h" + i} d={wave(b.y)} stroke="#4A2016" strokeOpacity={0.5} strokeWidth={11.8} strokeLinecap="round" />)}
        {BANDS.map((b, i) => <path key={"b" + i} d={wave(b.y)} stroke={b.c} strokeWidth={9.4} strokeLinecap="round" />)}
        <path d={wave(24.2)} stroke="#FFFFFF" strokeOpacity={0.26} strokeWidth={2} strokeLinecap="round" />
      </g>
      <g transform="rotate(11 30 34)">
        <circle cx={25} cy={33} r={2.6} fill="#3A1E14" /><circle cx={35} cy={33} r={2.6} fill="#3A1E14" />
        <circle cx={24.1} cy={32.1} r={0.9} fill="#fff" /><circle cx={34.1} cy={32.1} r={0.9} fill="#fff" />
        <path d="M26 38 Q30 41.5 34 38" stroke="#3A1E14" strokeWidth={1.7} fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
