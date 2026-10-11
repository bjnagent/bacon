import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isAppPath, parsePath } from "@/lib/client/routes";

const TITLES: Record<string, string> = {
  today: "Today", watchlist: "Watchlist", analyze: "Analyze", record: "Track record", account: "Account",
};

function pathOf(slug: string[] | undefined) {
  return "/" + (slug ?? []).map(encodeURIComponent).join("/");
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = parsePath(pathOf(slug));
  const title = r.tab === "analyze" && r.symbol ? `${r.symbol} · Analyze` : r.sub === "news" ? "Headlines" : r.sub === "property" ? "Property" : TITLES[r.tab];
  return { title: `${title} · Bacon` };
}

// Every app URL resolves here; the shell in the layout renders the screen.
export default async function AppPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  if (!isAppPath(pathOf(slug))) notFound();
  return null;
}
