/// <reference types="@capacitor/splash-screen" />
/// <reference types="@capacitor/status-bar" />
/// <reference types="@capacitor/push-notifications" />

// The iOS app: a native Capacitor shell around the deployed web app.
//
// The shell loads the live site (server.url), so every web deploy reaches the
// app the moment it ships. What the shell adds is native: APNs push, Taptic
// haptics, the share sheet, in-app Safari, StoreKit subscriptions (RevenueCat),
// universal links, the launch screen and a bundled offline screen. The web
// side reaches all of it through `window.Capacitor` (lib/native.ts) without
// importing a single @capacitor package. See docs/ios.md.
//
// Read by `npx cap sync ios` on the developer's machine (CAP_* env vars are
// read at sync time and baked into ios/App/App/capacitor.config.json).

import type { CapacitorConfig } from "@capacitor/cli";
import type { KeyboardResize } from "@capacitor/keyboard";

/** Bundle identifier. Must match the App ID in the Apple Developer portal. */
const appId = process.env.CAP_APP_ID || "app.bacon.research";

/** The deployed web app the shell loads. No trailing slash. */
const serverUrl = (process.env.CAP_SERVER_URL || "https://bacon-flax.vercel.app").replace(/\/+$/, "");

// Light-mode page background (--bg in app/globals.css). The native layer
// replaces it with a light/dark dynamic colour (LaunchBackground in the asset
// catalog) as soon as the web view exists, so dark mode never flashes cream.
const BG = "#F6F4EF";

/** Native shell version, sent in the user agent. Keep in step with MARKETING_VERSION in Xcode. */
const SHELL_VERSION = "1.0";

const config: CapacitorConfig = {
  appId,
  appName: "Bacon",
  // Bundled into the binary: the branded offline screen (and an index that
  // points at it). Shown only when the server can't be reached.
  webDir: "ios-web",
  backgroundColor: BG,

  server: {
    url: serverUrl,
    // Any failed navigation (offline, DNS, TLS, 5xx at the edge) lands on the
    // bundled page instead of a blank web view. Resolved against the local
    // scheme: capacitor://localhost/offline.html.
    errorPath: "offline.html",
    // Only for pointing a dev build at a LAN dev server (CAP_SERVER_URL=http://…).
    cleartext: serverUrl.startsWith("http://"),
  },

  ios: {
    // Xcode scheme `cap run/build` uses.
    scheme: "App",
    // The web app pads itself with env(safe-area-inset-*); letting UIKit also
    // inset the scroll view would double the padding and break the fixed
    // top bar / tab bar.
    contentInset: "never",
    backgroundColor: BG,
    // App-Bound Domains stay OFF. Turning them on is the only way WKWebView in
    // a third-party app gets Service Workers, but we deliberately run without
    // one in the shell (the bundled offline page covers offline; a SW caching
    // HTML would fight web deploys, which are this app's update channel). The
    // cost of turning it on — a hard cap of 10 domains and every other
    // top-level origin (Supabase auth hops, embeds, checkout pages) blocked
    // inside the web view — buys us nothing.
    limitsNavigationsToAppBoundDomains: false,
    // Long-press on a link shows a Safari preview card — a web tell; off.
    allowsLinkPreview: false,
    // iPad gets the desktop-class layout (sidebar ≥ 900px); iPhone the mobile one.
    preferredContentMode: "recommended",
    // "… Mobile/15E148 BaconApp/1.0" on every request the web view makes. The
    // server keys off it: /api/billing/checkout refuses Stripe checkout inside
    // the app (409 use_in_app_purchase — App Store Guideline 3.1.1). Client
    // code uses isNative() instead.
    appendUserAgent: `BaconApp/${SHELL_VERSION}`,
  },

  plugins: {
    SplashScreen: {
      // The web app hides the launch screen itself (lib/native.ts hideSplash)
      // once its first real frame is up: components/PwaRegister.tsx on every
      // page, and ios-web/offline.html when the server is unreachable.
      launchAutoHide: false,
      showSpinner: false,
      // No backgroundColor: the LaunchScreen storyboard uses an adaptive
      // (light/dark) named colour, which a hex here would override.
    },
    StatusBar: {
      // Draw edge-to-edge under the status bar; the web app pads with
      // env(safe-area-inset-top). Style follows the theme (NativeBridge).
      overlaysWebView: true,
      style: "DEFAULT",
    },
    Keyboard: {
      // "native": the web view itself shrinks to end at the keyboard's top
      // edge. position:fixed bottom UI (the chat composer) then sits right on
      // the keyboard with no JS, and env(safe-area-inset-bottom) drops to 0
      // while it's open. "body" only resizes <body>, leaving fixed elements
      // pinned to the full-height viewport behind the keyboard; "none" leaves
      // the composer hidden. The tab bar is hidden via html.kb-open (set by
      // NativeBridge) so it doesn't ride up on the keyboard.
      resize: "native" as KeyboardResize, // type-only: the enum value is the string "native"
      // Paint the area behind the keyboard with the page's own background, so
      // dark mode doesn't flash white while the web view resizes.
      autoBackdropColor: "dom",
    },
    PushNotifications: {
      // Foreground presentation. "alert" is deprecated on iOS (it maps to
      // banner + list), so the two are listed explicitly.
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
};

export default config;
