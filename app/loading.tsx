import BaconMark from "@/components/BaconMark";

export default function Loading() {
  return (
    <div className="pr-app">
      <div className="pr-login">
        <div className="pr-login-card">
          <div className="pr-login-mark"><BaconMark size={44} /></div>
          <div className="pr-login-name">Loading…</div>
        </div>
      </div>
    </div>
  );
}
