"use client";

import { useEffect } from "react";
import Link from "next/link";
import BaconMark from "@/components/BaconMark";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="center-screen">
      <div className="center-card">
        <BaconMark size={52} />
        <h1>Something went wrong</h1>
        <p>This screen hit an unexpected error. Your data is safe — try again, and if it keeps happening, let us know.</p>
        <div className="row-wrap" style={{ justifyContent: "center" }}>
          <button className="ui-btn ui-btn--primary" onClick={reset}>Try again</button>
          <Link className="ui-btn" href="/">Go home</Link>
        </div>
        {error.digest && <p className="t-caption">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
