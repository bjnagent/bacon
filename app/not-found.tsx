import Link from "next/link";
import BaconMark from "@/components/BaconMark";

export default function NotFound() {
  return (
    <div className="pr-app">
      <div className="pr-login">
        <div className="pr-login-card">
          <div className="pr-login-mark"><BaconMark size={48} /></div>
          <div className="pr-login-name">404</div>
          <p className="pr-login-sub">That page isn&apos;t on the radar.</p>
          <Link className="pr-login-btn" href="/" style={{ textDecoration: "none" }}>Back to Bacon</Link>
        </div>
      </div>
    </div>
  );
}
