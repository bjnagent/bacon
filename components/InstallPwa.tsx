"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Progressive layer over the static install instructions: Chrome/Edge fire
// beforeinstallprompt, which lets us offer a one-tap install button. An app
// already running standalone gets a confirmation instead. iOS Safari never
// fires the event — the static steps on the page cover that path.
export default function InstallPwa() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const standalone = window.matchMedia("(display-mode: standalone)").matches
          || (navigator as Navigator & { standalone?: boolean }).standalone === true;
        if (standalone) setInstalled(true);
      } catch { /* ignore */ }
    }, 0);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallPrompt(e as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(id);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <div className="pr-w-installed">✓ Installed — you&apos;re running the app</div>;
  if (!installPrompt) return null;
  return (
    <button
      className="pr-w-btn pr-w-installbtn"
      onClick={async () => { try { await installPrompt.prompt(); } catch { /* user dismissed */ } }}
    >
      Install Bacon on this device
    </button>
  );
}
