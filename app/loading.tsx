import BaconMark from "@/components/BaconMark";

export default function Loading() {
  return (
    <div className="center-screen" aria-busy="true">
      <div className="center-card">
        <BaconMark size={48} />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
