// Fixed strings the Account tab links out to. One place, so the support
// address in the app, the App Store listing and the legal pages can't drift.

export const SUPPORT_EMAIL = "support@bacon.app";

export const LEGAL = {
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  disclaimer: "/legal/disclaimer",
} as const;

/** Apple's own subscription manager — the only place an App Store plan can be cancelled. */
export const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

/** Inlined at build time; "1.0" for local builds that don't set it. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "1.0";

export function supportMailto(subject = "Bacon help & feedback"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
