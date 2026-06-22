"use client";

import { useEffect } from "react";
import BaconMark from "@/components/BaconMark";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="pr-app">
      <div className="pr-login">
        <div className="pr-login-card">
          <div className="pr-login-mark"><BaconMark size={48} /></div>
          <div className="pr-login-name">Something broke</div>
          <p className="pr-login-sub">An unexpected error occurred while loading this view. Your data is safe — try again.</p>
          <button className="pr-login-btn" onClick={reset}>Retry</button>
          <p className="pr-login-note">Verify yourself · Not financial advice</p>
        </div>
      </div>
    </div>
  );
}
