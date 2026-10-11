"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

// Says so when the connection drops, instead of letting every screen fail its
// next request in its own way. Screens keep showing what they already loaded.
const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};

export default function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div className="app-offline" role="status">
      <WifiOff size={16} aria-hidden="true" />
      You&apos;re offline — showing what&apos;s already loaded.
    </div>
  );
}
