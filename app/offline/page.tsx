import type { Metadata } from "next";
import BaconMark from "@/components/BaconMark";

export const metadata: Metadata = {
  title: "Offline · Bacon",
  robots: { index: false, follow: false },
};

// Served by the service worker (public/sw.js) when a navigation fails with no
// network. Must stay fully static and self-contained: it is precached, so it
// can't depend on anything fetched at view time. "Try again" is a plain link
// so it works before (or without) JavaScript.
export default function Offline() {
  return (
    <main className="center-screen">
      <div className="center-card">
        <BaconMark size={52} />
        <h1>You&apos;re offline</h1>
        <p>
          Bacon won&apos;t show market data it can&apos;t confirm is current. Reconnect and you&apos;ll pick up right where you
          left off.
        </p>
        {/* A full document load on purpose: a client-side <Link> transition
            would reuse this page's router state; a real navigation re-asks the
            network and lets the service worker step aside once it's back. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="ui-btn ui-btn--primary ui-btn--lg" href="/" style={{ marginTop: "var(--s-2)" }}>Try again</a>
        <p className="t-caption">Research, not investment advice.</p>
      </div>
    </main>
  );
}
