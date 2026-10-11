"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import s from "./marketing/Install.module.css";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Progressive layer over the static install steps: Chrome and Edge fire
// beforeinstallprompt, which lets us offer a one-tap install button. A page
// already running as the installed app gets a confirmation instead. iOS Safari
// never fires the event — the written steps cover that path.
export default function InstallPwa() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const standalone = window.matchMedia("(display-mode: standalone)").matches
          || (navigator as Navigator & { standalone?: boolean }).standalone === true;
        if (standalone) setInstalled(true);
      } catch { /* very old browsers: just show the steps */ }
    }, 0);
    // preventDefault keeps Chrome's own mini-infobar away so the prompt only
    // appears when the person asks for it.
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

  if (installed) {
    return <p className={`${s.actions} ${s.installed}`}><Check aria-hidden="true" /> Installed — you&apos;re using the app.</p>;
  }
  if (!installPrompt) return null;
  return (
    <div className={s.actions}>
      <button
        type="button"
        className="ui-btn ui-btn--primary"
        onClick={async () => {
          try { await installPrompt.prompt(); } catch { /* dismissed */ }
          // A prompt can only be used once.
          setInstallPrompt(null);
        }}
      >
        Install Bacon on this device
      </button>
    </div>
  );
}
