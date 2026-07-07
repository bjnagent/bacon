"use client";

import { useEffect } from "react";

// Registers the service worker (production only — dev caching causes confusion).
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* PWA is progressive — registration failure is fine */ });
  }, []);
  return null;
}
