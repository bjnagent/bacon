// The bridge to the iOS app's native layer, without bundling it into the web app.
//
// The iOS app is a Capacitor shell that loads this site. Capacitor injects a
// `window.Capacitor` global into every page it hosts, with a proxy for each
// native plugin compiled into the app. Talking to that global — rather than
// importing the @capacitor/* packages here — keeps the web bundle free of
// native code and makes every helper a silent no-op in a normal browser.
//
// Rule for callers: nothing here may throw or block. Native polish is optional;
// the action it decorates is not.

type PluginFn = (opts?: Record<string, unknown>) => Promise<unknown>;
type Plugin = Record<string, PluginFn | ((...a: unknown[]) => unknown)>;

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, Plugin | undefined>;
}

function cap(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

/** True inside the iOS (or any Capacitor) app. */
export function isNative(): boolean {
  try { return !!cap()?.isNativePlatform?.(); } catch { return false; }
}

export function platform(): "ios" | "android" | "web" {
  try {
    const p = cap()?.getPlatform?.();
    return p === "ios" || p === "android" ? p : "web";
  } catch { return "web"; }
}

export function plugin(name: string): Plugin | null {
  if (!isNative()) return null;
  return cap()?.Plugins?.[name] ?? null;
}

async function call(name: string, method: string, opts?: Record<string, unknown>): Promise<unknown> {
  try {
    const fn = plugin(name)?.[method] as PluginFn | undefined;
    return fn ? await fn(opts) : undefined;
  } catch { return undefined; }
}

export type HapticKind = "light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error";

/** Taptic feedback. Fire-and-forget. */
export function haptic(kind: HapticKind = "light"): void {
  if (!isNative()) return;
  if (kind === "selection") { void call("Haptics", "selectionChanged"); return; }
  if (kind === "success" || kind === "warning" || kind === "error") {
    void call("Haptics", "notification", { type: kind.toUpperCase() });
    return;
  }
  void call("Haptics", "impact", { style: kind.toUpperCase() });
}

/** Native share sheet in the app; Web Share or clipboard in the browser. Resolves true if shared/copied. */
export async function share(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (isNative() && plugin("Share")) {
    const r = await call("Share", "share", { ...data, dialogTitle: data.title });
    return r !== undefined;
  }
  try {
    if (typeof navigator !== "undefined" && navigator.share) { await navigator.share(data); return true; }
    if (typeof navigator !== "undefined" && navigator.clipboard && data.url) { await navigator.clipboard.writeText(data.url); return true; }
  } catch { /* user cancelled */ }
  return false;
}

/**
 * Open an external URL. In the app this uses an in-app Safari view so the user
 * never loses their place; on the web, a new tab.
 */
export function openExternal(url: string): void {
  if (isNative() && plugin("Browser")) { void call("Browser", "open", { url, presentationStyle: "popover" }); return; }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

/** Match the iOS status bar to the current theme. */
export function setStatusBar(theme: "light" | "dark"): void {
  if (!isNative()) return;
  // Capacitor names the style by BACKGROUND: "DARK" draws light text for a dark
  // background, "LIGHT" draws dark text for a light one.
  void call("StatusBar", "setStyle", { style: theme === "dark" ? "DARK" : "LIGHT" });
}

/** Hide the launch screen once the first real frame is up. */
export function hideSplash(): void {
  if (!isNative()) return;
  void call("SplashScreen", "hide", { fadeOutDuration: 200 });
}
