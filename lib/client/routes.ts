// URL <-> screen mapping for the signed-in app.
//
// Every screen has a real URL, so a push notification, a universal link from
// an email, a shared link and a browser refresh all land in the right place.
// The shell keeps every visited screen mounted and switches between them with
// the History API, so a URL change never refetches or re-runs anything.

export type TabId = "today" | "watchlist" | "analyze" | "record" | "account";

export interface AppRoute {
  tab: TabId;
  /** Secondary view inside a tab: today → brief|news, watchlist → names|property, account → section. */
  sub?: string;
  /** Analyze only: the symbol in the URL, upper-cased. */
  symbol?: string;
}

export const TABS: { id: TabId; label: string; path: string }[] = [
  { id: "today", label: "Today", path: "/" },
  { id: "watchlist", label: "Watchlist", path: "/watchlist" },
  { id: "analyze", label: "Analyze", path: "/analyze" },
  { id: "record", label: "Record", path: "/track-record" },
  { id: "account", label: "Account", path: "/account" },
];

/** First path segments the app shell owns (anything else under the catch-all 404s). */
export const APP_SEGMENTS = new Set(["", "news", "watchlist", "property", "analyze", "track-record", "account"]);

export function parsePath(pathname: string): AppRoute {
  const parts = pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  const [head = "", second] = parts;
  switch (head) {
    case "": return { tab: "today", sub: "brief" };
    case "news": return { tab: "today", sub: "news" };
    case "watchlist": return { tab: "watchlist", sub: "names" };
    case "property": return { tab: "watchlist", sub: "property" };
    case "analyze": return second ? { tab: "analyze", symbol: second.toUpperCase().slice(0, 40) } : { tab: "analyze" };
    case "track-record": return { tab: "record" };
    case "account": return { tab: "account", sub: second };
    default: return { tab: "today", sub: "brief" };
  }
}

export function isAppPath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (!APP_SEGMENTS.has(parts[0] ?? "")) return false;
  if (parts[0] === "analyze") return parts.length <= 2;
  if (parts[0] === "account") return parts.length <= 2;
  return parts.length <= 1;
}

export const paths = {
  today: () => "/",
  news: () => "/news",
  watchlist: () => "/watchlist",
  property: () => "/property",
  analyze: (symbol?: string) => (symbol ? `/analyze/${encodeURIComponent(symbol.trim().toUpperCase())}` : "/analyze"),
  record: () => "/track-record",
  account: (section?: string) => (section ? `/account/${section}` : "/account"),
};
