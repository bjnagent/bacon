"use client";

// Catches errors in the root layout itself (must render its own <html>/<body>).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#EBE8E0", color: "#1A1712", fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Bacon hit an unexpected error</h1>
          <p style={{ color: "#6E6658" }}>Reload to try again.</p>
          <button onClick={reset} style={{ background: "#EE4310", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      </body>
    </html>
  );
}
