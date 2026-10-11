// Facts the public pages (landing, pricing, legal) share. One place, so the
// contact address in the footer, the Terms and the Privacy Policy can never
// disagree.
//
// LAUNCH CHECKLIST — confirm each of these with counsel / the founder before
// the site goes public; they are reasonable defaults, not decisions.

/** Canonical origin for absolute URLs (sitemap, Open Graph). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Where people reach a human. Also the privacy and legal contact. */
export const CONTACT_EMAIL = "contact@bacon.app";

/** The party users contract with. Replace with the registered entity name. */
export const LEGAL_ENTITY = "Bacon";

/** True until a registered entity name replaces the brand placeholder above. */
export const ENTITY_IS_BRAND = LEGAL_ENTITY === "Bacon";

/** Governing law + courts for the Terms. The production region is Singapore (vercel.json: sin1). */
export const GOVERNING_LAW = "Singapore";

/** Web (Stripe) refund window for a first subscription payment, in days. */
export const REFUND_WINDOW_DAYS = 14;

/** Shown on every legal page. Bump when the text materially changes. */
export const LEGAL_UPDATED = "2026-10-11";

/** Public App Store listing, once the iOS app is live. Unset = no badge. */
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || "";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** "11 October 2026" — fixed locale so server and client agree. */
export function formatLegalDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
