"use client";

import { useEffect } from "react";
import { hideSplash } from "@/lib/native";

// Catches errors in the root layout itself (must render its own <html>/<body>).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // This replaces the root layout, so nothing else will lift the iOS launch
  // screen: without this a fatal first-launch error would sit behind it.
  useEffect(() => { hideSplash(); }, []);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#F6F4EF", color: "#1B1712", fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Bacon hit an unexpected error</h1>
          <p style={{ color: "#5C5348" }}>Reload to try again.</p>
          <button onClick={reset} style={{ background: "#CC3F0E", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      </body>
    </html>
  );
}
