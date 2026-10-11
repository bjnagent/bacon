"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import s from "./welcome.module.css";

// The account-deletion flow lands here with ?deleted=1. Read on the client so
// the landing page itself stays static (searchParams on the server would make
// every visit render on demand).
export default function DeletedNotice() {
  const params = useSearchParams();
  const [dismissed, setDismissed] = useState(false);
  if (params.get("deleted") !== "1" || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    // Drop the flag so a reload or a shared link doesn't repeat the message.
    try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch { /* ignore */ }
  };

  return (
    <div className={s.deleted} role="status">
      <p><strong>Your account has been deleted.</strong> Thanks for giving Bacon a try.</p>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={dismiss}>Dismiss</button>
    </div>
  );
}
