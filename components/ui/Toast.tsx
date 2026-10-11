"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { haptic } from "@/lib/native";

// A tiny global toast store: `toast("Saved")` from anywhere, one <Toaster/> in
// the shell renders them. No context needed, so non-React code (fetch helpers)
// can raise one too.

export interface ToastItem { id: number; kind: "success" | "error" | "info"; message: string; action?: { label: string; run: () => void } }

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, opts: { kind?: ToastItem["kind"]; action?: ToastItem["action"]; ms?: number } = {}) {
  const id = ++seq;
  const kind = opts.kind ?? "success";
  items = [...items.slice(-2), { id, kind, message, action: opts.action }];
  emit();
  haptic(kind === "error" ? "error" : kind === "success" ? "success" : "light");
  setTimeout(() => dismiss(id), opts.ms ?? (opts.action ? 6000 : 3200));
  return id;
}
toast.error = (message: string, action?: ToastItem["action"]) => toast(message, { kind: "error", action });
toast.info = (message: string, action?: ToastItem["action"]) => toast(message, { kind: "info", action });

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => items;
const EMPTY: ToastItem[] = [];
const serverSnapshot = () => EMPTY;

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <div className="ui-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`ui-toast is-${t.kind}`}>
          {t.kind === "success" ? <CheckCircle2 /> : t.kind === "error" ? <AlertCircle /> : <Info />}
          <span className="ui-toast-msg">{t.message}</span>
          {t.action && <button type="button" className="ui-toast-action" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}
