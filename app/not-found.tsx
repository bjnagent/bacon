import Link from "next/link";
import BaconMark from "@/components/BaconMark";

export default function NotFound() {
  return (
    <main className="center-screen">
      <div className="center-card">
        <BaconMark size={52} />
        <h1>Page not found</h1>
        <p>That page isn&apos;t on the radar. It may have moved, or the link is incomplete.</p>
        <Link className="ui-btn ui-btn--primary" href="/">Back to Bacon</Link>
      </div>
    </main>
  );
}
