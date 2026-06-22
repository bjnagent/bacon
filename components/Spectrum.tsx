import { LENSES } from "@/lib/lenses";

// The six-lens colour spectrum bar. Ported from the artifact.
export default function Spectrum({ height = 4, className = "" }: { height?: number; className?: string }) {
  return (
    <div className={`pr-spectrum ${className}`} style={{ height }}>
      {LENSES.map((l) => <span key={l.key} style={{ background: l.hue }} />)}
    </div>
  );
}
