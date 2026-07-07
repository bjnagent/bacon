import BaconMark from "@/components/BaconMark";

// Offline fallback served by the service worker when a navigation fails.
export default function Offline() {
  return (
    <div className="pr-app">
      <div className="pr-login">
        <div className="pr-login-card">
          <div className="pr-login-mark"><BaconMark size={48} /></div>
          <div className="pr-login-name">Off the air</div>
          <p className="pr-login-sub">No connection — and Bacon won&apos;t show you stale market data as if it were live. Reconnect and your cockpit picks up where it left off.</p>
          <p className="pr-login-note">Verify yourself · Not financial advice</p>
        </div>
      </div>
    </div>
  );
}
