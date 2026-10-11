# Bacon for iOS

How the App Store app is built, configured, shipped and kept in review shape.

- **Shell:** Capacitor 8.5 (Swift Package Manager, no CocoaPods), project in `ios/`.
- **Content:** the deployed web app (`server.url`, default `https://bacon-flax.vercel.app`).
- **Native:** APNs push, StoreKit subscriptions via RevenueCat, Taptic haptics, the share sheet, in-app Safari, universal links, password AutoFill, status bar, launch screen, keyboard handling and a bundled offline screen.

---

## 1. Architecture

```
┌──────────────────────────── iOS app (ios/) ─────────────────────────────┐
│ SceneDelegate → BaconBridgeViewController (CAPBridgeViewController)      │
│   WKWebView ── loads ──► https://<server.url>/  (the Next.js app)        │
│      │  window.Capacitor.Plugins.*   (injected by the native bridge)     │
│      │  window.BaconNative = { apsEnvironment, serverUrl, appVersion }   │
│   Plugins: App · Browser · Haptics · Keyboard · PushNotifications ·      │
│            Share · SplashScreen · StatusBar · Purchases (RevenueCat)     │
│   ios/App/App/public/offline.html  ◄── server.errorPath (no network)     │
└──────────────────────────────────────────────────────────────────────────┘
          │ device token                     │ StoreKit purchase
          ▼                                  ▼
 POST /api/push/register            RevenueCat ── webhook ──► /api/billing/revenuecat
 device_tokens (Supabase)                                      subscriptions (Supabase)
          ▲
 lib/push.ts notifyUser() ── lib/apns.ts ── HTTP/2 + ES256 JWT ──► APNs
 (cron/sweep: brief ready · cron/watch: kill condition)
```

**Why a shell around the live site.** One codebase, one deploy: a web deploy reaches the app instantly, so product iteration never waits on App Review. The shell is still a real app, not a repackaged website (Guideline 4.2) — see §9.

**The no-import rule.** The web bundle never imports `@capacitor/*` or `@revenuecat/*`. Capacitor injects a proxy for every native plugin into `window.Capacitor.Plugins` at document start; `lib/native.ts`, `lib/client/push.ts` and `lib/client/purchases.ts` call those proxies and are silent no-ops in a browser. The npm packages exist only so `cap sync` can compile their native code into the app.

| Where | What it does |
|---|---|
| `capacitor.config.ts` | appId, server.url, errorPath, plugin config (env: `CAP_APP_ID`, `CAP_SERVER_URL`) |
| `ios-web/` | bundled web dir: `offline.html` (branded offline screen with Retry), `index.html` |
| `ios/App/App/BaconBridgeViewController.swift` | adaptive background, publishes `window.BaconNative` (APNs environment, server URL) |
| `ios/App/App/AppDelegate.swift` | forwards the APNs device token to the push plugin |
| `ios/App/App/SceneDelegate.swift` | builds the window; forwards universal links to the App plugin |
| `ios/App/App/Info.plist`, `App.entitlements`, `PrivacyInfo.xcprivacy` | app metadata, capabilities, privacy manifest |
| `resources/` + `scripts/gen-ios-assets.mjs` | icon/launch-mark sources → asset catalog (`npm run ios:assets`) |
| `components/PwaRegister.tsx` | every page: hide launch screen, route universal links, external links → in-app Safari; no service worker in the app |
| `components/app/NativeBridge.tsx` | signed-in app: status bar ↔ theme, `html.kb-open`, push registration + taps, RevenueCat identity |
| `lib/client/push.ts` | `requestPushPermission()`, `registerIfGranted()`, `unregisterPush()`, `onNotificationOpened()` |
| `lib/client/purchases.ts` | `purchase(plan, interval)`, `restore()`, `identifyPurchaser(userId)` |
| `lib/push.ts`, `lib/apns.ts` | `notifyUser()`; APNs client (JWT, HTTP/2, pooled connections, dead-token pruning) |
| `app/api/push/register/route.ts` | POST/DELETE device tokens |
| `app/.well-known/apple-app-site-association/route.ts` | AASA for universal links + webcredentials |

### Decisions worth knowing

- **App-Bound Domains: off** (`limitsNavigationsToAppBoundDomains: false`). It is the only way a WKWebView in a third-party app gets Service Workers, but the app deliberately runs without one: the bundled offline page covers "no network", and a worker caching HTML would fight web deploys (the app's update channel). Turning it on would cap the app at 10 domains and block every other top-level origin in the web view. `PwaRegister` therefore never registers `/sw.js` inside the app (and removes any stray registration); browsers keep the PWA.
- **Keyboard `resize: "native"`.** The web view itself shrinks to the top of the keyboard, so `position: fixed` bottom UI (the chat composer) sits on the keyboard without JS and `env(safe-area-inset-bottom)` drops to 0. NativeBridge sets `html.kb-open` while it's up so CSS can hide the tab bar (see §11). `autoBackdropColor: "dom"` paints behind the keyboard with the page background (no white flash in dark mode).
- **`contentInset: "never"` + StatusBar `overlaysWebView: true`.** Edge-to-edge; the web app pads with `env(safe-area-inset-*)`.
- **Launch screen** stays up (`launchAutoHide: false`) until the web calls `SplashScreen.hide()`: `PwaRegister` does it on every page (incl. `/login`), `offline.html` does it when the site is unreachable.
- **`server.errorPath: "offline.html"`.** Any failed main-frame navigation shows the bundled page; it retries `/api/health` on tap, when the device comes back online, and on app resume.
- **Push permission is never requested on launch.** Only `requestPushPermission()` prompts, called from a screen where the user asked for alerts.
- **Magic links.** The PKCE magic link (`/api/auth/callback`) can't complete in the app (its verifier lives in the browser that asked). Sign-in inside the app uses email + password, or the `token_hash` link (`/api/auth/confirm`), which the AASA routes into the app — see §6.

---

## 2. Prerequisites

- A Mac with **Xcode 26+** (Command Line Tools installed) and Node 20+.
- **Apple Developer Program** membership (organisation account recommended for a finance app — the seller name shown on the App Store is the legal entity).
- Access to App Store Connect, RevenueCat, Vercel env vars and the Supabase project.
- A physical iPhone for push and purchase testing (the simulator can register for push on Apple-silicon Macs, but test real delivery on a device).

---

## 3. One-time setup

### 3.1 Bundle id & capabilities (developer.apple.com → Certificates, IDs & Profiles → Identifiers)

1. Register the App ID **`app.bacon.research`** (or your own — then set `CAP_APP_ID`, change `PRODUCT_BUNDLE_IDENTIFIER` in Xcode → target App → Signing & Capabilities, and set `APNS_BUNDLE_ID`).
2. Enable **Push Notifications**, **Associated Domains**. **In-App Purchase** is on for every App ID.

### 3.2 Xcode

```bash
npm install            # SPM resolves the plugins from node_modules — required before opening Xcode
npm run ios:sync       # cap sync ios: copies ios-web/, writes capacitor.config.json + Package.swift
npm run ios:open       # opens ios/App/App.xcodeproj
```

In Xcode → target **App** → **Signing & Capabilities**:
- Team: your team; "Automatically manage signing": on.
- Confirm the capabilities list shows **Push Notifications**, **Associated Domains** (`applinks:` + `webcredentials:` for the site host — from `App/App.entitlements`), **Background Modes → Remote notifications** (from Info.plist), and add **In-App Purchase** (adds no entitlement; it just shows in the list).
- General → Version/Build: `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (bump the build for every upload).

`aps-environment` in `App.entitlements` is **`development` on purpose**: development-signed builds (Run, and Archive with automatic signing) only allow "development", and Xcode rewrites it to **production** from the distribution profile when the archive is exported to App Store Connect/TestFlight. Hard-coding "production" breaks development-signed builds with a profile/entitlement mismatch.

### 3.3 APNs key

developer.apple.com → Keys → **+** → "Apple Push Notifications service (APNs)" → download the `.p8` (once). Note the Key ID and your Team ID. Set the env vars in §4. One key serves both gateways and every app in the team.

---

## 4. Environment variables

### Server (Vercel → Project → Settings → Environment Variables)

| Variable | Purpose |
|---|---|
| `APNS_KEY_ID` | 10-char key id of the `.p8` key |
| `APNS_TEAM_ID` | Apple team id (JWT `iss`) |
| `APNS_PRIVATE_KEY` | contents of the `.p8`; one line with `\n` escapes is fine (bare base64 also accepted) |
| `APNS_BUNDLE_ID` | apns-topic = the bundle id (falls back to `CAP_APP_ID`, then nothing → push off) |
| `APNS_ENV` | optional, `production`/`sandbox`: gateway only for tokens with **no** stored environment. Each token's own environment (reported by the app) wins, and a `BadDeviceToken` is retried once on the other gateway, so dev and production devices both work against one server. |
| `APPLE_TEAM_ID` | AASA `appIDs` prefix; AASA 404s without it |
| `REVENUECAT_WEBHOOK_AUTH` | shared secret RevenueCat sends in `Authorization` (see §5.3) |
| `NEXT_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat **public** App Store SDK key (`appl_…`). `NEXT_PUBLIC_` = inlined at **build** time: redeploy after setting it. |
| `SUPABASE_SERVICE_ROLE_KEY` | already required; push sending and token re-assignment use it |

If any `APNS_*` value is missing, `notifyUser()` is a silent no-op (returns 0) — nothing else breaks.

### App build (your Mac, read by `cap sync`)

| Variable | Default | Purpose |
|---|---|---|
| `CAP_SERVER_URL` | `https://bacon-flax.vercel.app` | site the app loads; e.g. `CAP_SERVER_URL=http://localhost:3000 npm run ios:sync` to run the simulator against `next dev` (Info.plist allows local networking) |
| `CAP_APP_ID` | `app.bacon.research` | bundle id written to `capacitor.config.json` (the Xcode build setting must match) |

When the site moves to a custom domain: change `CAP_SERVER_URL`, both entries in `App.entitlements`, the AASA host you verify, and the Supabase redirect allow-list.

---

## 5. App Store Connect & RevenueCat

### 5.1 App record

- Name **Bacon** (subtitle e.g. "Your overnight research desk"), primary category **Finance**, secondary **News** or **Productivity**.
- Privacy Policy URL `https://<host>/legal/privacy`; Terms (EULA) — use `https://<host>/legal/terms` in the description and in the "License Agreement" field, or Apple's standard EULA plus a link.
- Age rating: no objectionable content; answer "unrestricted web access" **No** (the web view only shows Bacon; off-site links open in Safari View Controller).

### 5.2 Subscriptions

Subscription group **"Bacon"** (one group, so upgrades/downgrades/crossgrades are handled by Apple). Rank Desk above Pro.

| Level | Product id | Duration | Price (USD tier) | Entitlement |
|---|---|---|---|---|
| 1 | `bacon_desk_yearly` | 1 year | **$449.99** | `desk` |
| 1 | `bacon_desk_monthly` | 1 month | **$49.99** | `desk` |
| 2 | `bacon_pro_yearly` | 1 year | **$179.99** | `pro` |
| 2 | `bacon_pro_monthly` | 1 month | **$19.99** | `pro` |

These must match `lib/plans.ts` (Pro $19.99/mo, $179.99/yr; Desk $49.99/mo, $449.99/yr) and the server's product map (`DEFAULT_REVENUECAT_PRODUCTS` in `lib/billing.ts`; override with `REVENUECAT_PRODUCT_MAP` if ids ever differ). Let App Store Connect derive other storefronts from the USD price.

**Free trial / intro offer — recommendation: none at launch.** Every new account already gets a 7-day, no-card **reverse trial of Pro** (`TRIAL_DAYS` in `lib/plans.ts`), on the web and in the app alike. Adding an App Store free-trial intro offer would (a) give iOS users a second, stacked trial (7 + 7 days) the web doesn't get, (b) put "1 week free" on Apple's purchase sheet while the app says "N days left on your trial", and (c) let a trial user who taps Upgrade on day 5 get another free week. Keep one trial, owned by Bacon, on every channel. Revisit with an intro *discount* on yearly plans if conversion data calls for it.

Each product needs a display name, description, and a **review screenshot** of the paywall (Account → Plans in the app).

### 5.3 RevenueCat

1. Create a project → add an **App Store** app with the bundle id. Upload the **In-App Purchase key** (App Store Connect → Users and Access → Integrations → In-App Purchase) so RevenueCat can validate StoreKit 2 transactions, and set App Store Connect → App → App Information → **App Store Server Notifications** (production + sandbox) to the URL RevenueCat shows.
2. Products: import the four ids above.
3. Entitlements: **`pro`** ← `bacon_pro_monthly`, `bacon_pro_yearly`; **`desk`** ← `bacon_desk_monthly`, `bacon_desk_yearly`.
4. Offerings: a **`default`** (current) offering containing all four products (e.g. packages `$rc_monthly` / `$rc_annual` for Pro and custom `desk_monthly` / `desk_annual` for Desk). The app looks packages up by **product id** across all offerings, then falls back to the MONTHLY/ANNUAL package of an offering named `pro` / `desk`, so either layout works.
5. API keys → copy the **public App Store key** into `NEXT_PUBLIC_REVENUECAT_IOS_KEY`.
6. Integrations → **Webhooks**: URL `https://<host>/api/billing/revenuecat`, Authorization header value = `REVENUECAT_WEBHOOK_AUTH` (generate with `openssl rand -hex 32`; the route accepts the bare value or `Bearer <value>`).

Identity: NativeBridge calls `identifyPurchaser(me.user.id)` → RevenueCat `configure({ appUserID })` / `logIn()`, so every webhook's `app_user_id` **is the Supabase user id**. The webhook ignores anonymous (`$RCAnonymousID:…`) purchases, so:
- `purchase()` and `restore()` read the account (from the `me` they're given, else `GET /api/me`), then **re-check the native SDK's current app user id and `logIn()` if it isn't that account** — and refuse with a readable error if it is still anonymous. Money never moves on an anonymous id.
- RevenueCat is signed out (`signOutPurchaser()` → `logOut()`) whenever a page under `/login` loads in the app (where sign-out and expired sessions land) and when NativeBridge sees a loaded account with no user.
- A live **web (Stripe) subscriber** is never offered an App Store plan: `purchase()` throws "You subscribe on the web — manage it at <host> on the web." before any App Store sheet appears.

User agent: the web view appends **`BaconApp/<SHELL_VERSION>`** (`ios.appendUserAgent` in `capacitor.config.ts`; keep `SHELL_VERSION` in step with `MARKETING_VERSION`). `/api/billing/checkout` answers `409 use_in_app_purchase` to any request carrying it, so Stripe checkout can't be reached from inside the app even by a stale or third-party link.

---

## 6. Universal links, AASA & sign-in links

- Served at `https://<host>/.well-known/apple-app-site-association` (`app/.well-known/apple-app-site-association/route.ts`): JSON, no redirect, cacheable, `appIDs = ["<APPLE_TEAM_ID>.<bundle id>"]`. 404 until `APPLE_TEAM_ID` is set.
- Opens in the app: `/`, `/news`, `/watchlist`, `/property`, `/analyze`, `/analyze/*`, `/track-record`, `/account`, `/account/*`, `/onboarding(/*)`, and `/api/auth/confirm` (email sign-in, token_hash flow). Excluded: `/api/*`, `/admin*`. Everything else (landing, pricing, legal, `/login`) stays in the browser.
- In the app, a link to an app screen switches screens in place (no reload); anything else (sign-in links, signed-out state) is loaded as a page.
- `webcredentials` lets iCloud Keychain offer and save the account password on the in-app login form.

Verify:
```bash
curl -sD- https://bacon-flax.vercel.app/.well-known/apple-app-site-association     # 200, application/json, no Location
curl -s https://app-site-association.cdn-apple.com/a/v1/bacon-flax.vercel.app     # what Apple's CDN has cached (may lag ~24h)
```
On a device: paste `https://bacon-flax.vercel.app/analyze/NVDA` into Notes and tap it — it should open the app on Analyze. (Developer builds: Settings → Developer → Associated Domains Development to test against a staging host with `applinks:<host>?mode=developer`.)

**Magic links in the app (Supabase dashboard → Authentication → Email Templates → Magic Link):** point the link at the token_hash route so it can complete wherever it opens:
```
{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email
```
With the default PKCE template the link only works in the browser that requested it. Password sign-in is unaffected either way.

---

## 7. Push notifications

- **Permission:** asked only via `requestPushPermission()` (Account → Brief & alerts → Push notifications toggle, onboarding). It prompts once, registers with APNs and POSTs the token; afterwards NativeBridge re-registers silently on each launch (`registerIfGranted()`), which keeps `last_seen_at` fresh and picks up rotated tokens. If iOS answers "denied", send people to Settings: `window.location.assign("app-settings:")` opens the app's page in Settings.
- **Server:** `notifyUser(userId, { title, body, path, kind })` (callers: `cron/sweep` → "Your brief is ready", path `/`; `cron/watch` → kill-condition alerts, path `/track-record`). It honours `settings.push_enabled` (default on), sends to ≤10 newest devices, prunes tokens APNs reports dead (410, `BadDeviceToken` on both gateways, `DeviceTokenNotForTopic`), records a token's real gateway, never throws and gives up after 10 s. Plan gating (`push_alerts`) is the caller's job.
- **Payload:** `{ aps: { alert: { title, body }, sound: "default", "thread-id": kind }, path, kind }`; `apns-push-type: alert`, priority 10, 24 h expiry; morning briefs share `apns-collapse-id: brief` so today's replaces yesterday's.
- **Taps:** `pushNotificationActionPerformed` → the screen in `path` (also when the tap launched the app).
- **Environments:** `window.BaconNative.apsEnvironment` is "sandbox" for Xcode/development-signed builds and "production" for TestFlight/App Store (read from the embedded provisioning profile), sent with the token.
- **Test a send:** Apple's Push Notifications Console (developer.apple.com → CloudKit Console → Push Notifications) with a device token from `device_tokens`; or trigger the cron routes with `CRON_SECRET`.
- **Sign-out:** call `unregisterPush()` before signing out so the next person on the device doesn't get this account's alerts (a later sign-in also moves the token to the new account).

---

## 8. Build, run, ship

```bash
npm install
npm run ios:assets        # only after changing resources/*.svg (icon, launch mark, colours)
npm run ios:sync          # after any npm plugin change, capacitor.config.ts or ios-web/ change
npm run ios:open          # Xcode → pick a device → Run
npm run ios:run           # or: build + run on a chosen simulator/device from the CLI
```

- The first open resolves Swift packages (Capacitor 8.5.3 from GitHub, plugins from `node_modules`, RevenueCat `purchases-hybrid-common`/`purchases-ios`). If Xcode shows "Missing package product", File → Packages → Reset Package Caches.
- Debug builds allow Safari Web Inspector (Safari → Develop → <device> → bacon-flax.vercel.app).
- **TestFlight:** bump the build number → Product → Archive → Distribute App → App Store Connect → Upload. Internal testers get it after processing; external testers need Beta App Review. TestFlight purchases run in the sandbox at accelerated renewal (monthly ≈ 5 min); RevenueCat flags them `SANDBOX` and the webhook honours them (set `REVENUECAT_ACCEPT_SANDBOX=0` to ignore).

---

## 9. App Review checklist

**Account & access**
- [ ] *Sign-in required* → App Review Information → demo account **email + password** (password sign-in; a magic link can't be used by reviewers). Use a normal account (not on `ADMIN_EMAILS`), with a populated watchlist and a brief, and give it a plan via a `manual` subscription row so every feature is reviewable; note that it starts with a 7-day Pro trial anyway.
- [x] In-app **account deletion**: Account → Delete account (Guideline 5.1.1(v)).
- [x] No third-party social login, so Sign in with Apple isn't required (4.8).

**Payments (3.1.1 / 3.1.2)**
- [x] Digital subscriptions in the app go only through StoreKit (`startUpgrade` → `purchase()` when native); the server refuses Stripe checkout to the app's `BaconApp/…` user agent; no "cheaper on the web" copy inside the app.
- [ ] Web (Stripe) subscribers see their plan in the app but manage it on the web; check that nothing in the app *links* to the Stripe customer portal or checkout (anti-steering, 3.1.1 / 3.1.3) outside storefronts where that's permitted.
- [x] **Restore purchases** (paywall and Account → Plan).
- [x] Paywall states price/period, auto-renewal terms, and links Terms + Privacy.
- [ ] Subscriptions submitted together with the first build, each with its review screenshot.

**Privacy**
- [ ] Nutrition label matches `PrivacyInfo.xcprivacy`: *Data Linked to You* — Contact Info: **Email Address**; Identifiers: **User ID**; Purchases: **Purchase History**; Usage Data: **Product Interaction** (analytics); User Content: **Other User Content** (watchlists, themes, chats, saved analyses). **Data Used to Track You: none.** No location, contacts, advertising identifier, health or crash data. (Conservative option: also declare Identifiers → Device ID for APNs tokens — Apple doesn't require it, but it costs nothing.)
- [ ] Privacy Policy URL live and matching the label.

**Finance (Guidelines 1.1.6, 3.2.1(viii), 5.1)**
- [ ] Review notes: *"Bacon is an investment research tool. It does not execute trades, hold or move money, connect to brokerage accounts or give personalised financial advice. All content is labelled research, not advice."* (3.2.1(viii) restricts apps that perform trading, investing or money management — Bacon does none.)
- [x] Disclaimers in the product ("Research, not advice. Verify before you act.", `/legal/disclaimer`).
- [ ] No promises of returns in screenshots, subtitle or description.

**Not a repackaged website (4.2) — native capabilities to list in the review notes**
1. Push notifications via APNs (morning brief ready, kill-condition alerts) with deep links into the right screen.
2. StoreKit in-app subscriptions with restore.
3. Universal links (emails and shared links open the matching screen) and iCloud Keychain password AutoFill (webcredentials).
4. Taptic Engine haptics on navigation and actions.
5. Native share sheet for ideas and analyses.
6. In-app Safari View Controller for sources and filings.
7. Native launch screen, adaptive light/dark status bar, keyboard-aware chat composer.
8. Bundled offline screen that reconnects automatically.

**Technical**
- [x] `ITSAppUsesNonExemptEncryption = false` (HTTPS only) — no export compliance questions per build.
- [x] iPhone portrait only; iPad all orientations (multitasking capable).
- [x] Icon 1024×1024 without alpha; adaptive launch screen.

### Screenshots

- **iPhone 6.9"** (required): 1320 × 2868 (or 1290 × 2796) portrait — Today brief, Analyze deep dive, Watchlist, Track record, paywall/plans.
- **iPad 13"** (required because the app runs on iPad — `TARGETED_DEVICE_FAMILY = 1,2`): 2064 × 2752 (or 2048 × 2732). To ship iPhone-only instead, set Targeted Device Family to iPhone in Xcode and drop the iPad screenshots.

---

## 10. Releases & updates

- **Web deploys update the app immediately.** Anything in `app/`, `components/`, `lib/` reaches every installed app on the next launch/navigation. Keep the web compatible with the oldest shell still in use: always feature-detect native plugins (lib/native.ts already treats a missing plugin as a no-op) and never require a plugin the current App Store build lacks.
- **Native changes need a new build and review:** adding/upgrading a Capacitor plugin, `capacitor.config.ts`, `Info.plist`, entitlements, icons/launch screen, Swift code, the bundled `ios-web/` page, the RevenueCat SDK.
- **Stay within review:** remote updates may change content and fix bugs but must not change the app's primary purpose or add features that would need review on their own (2.5.2, 3.3.1(b)). Keep the reviewed build representative.
- Versioning: bump `MARKETING_VERSION` for user-visible native releases, `CURRENT_PROJECT_VERSION` for every upload. `window.BaconNative.appVersion` / `.build` let the web adapt to old shells if ever needed.

---

## 11. Open items outside the native project

- `app/globals.css`: `html.kb-open .app-tabbar { display: none; }` (and drop any tab-bar bottom padding on `.app-content`/the chat sheet while `kb-open`), so the tab bar doesn't ride up on the keyboard.
- `app/global-error.tsx` replaces the root layout (no `PwaRegister`): add `useEffect(() => hideSplash(), [])` (from `@/lib/native`) so a fatal error on first launch can't leave the launch screen up.
- Account → push toggle: when switching **on** in the app, call `requestPushPermission()` (and on "denied", explain + `window.location.assign("app-settings:")`); on sign-out call `unregisterPush()` first.

## 12. Mac-only steps (not possible from Linux CI)

- Open the project once in Xcode 26 to resolve packages and let Xcode upgrade project settings if it offers to (accept the recommended settings).
- Set the Team, verify capabilities (§3.2), build and run on a device.
- Verify on device: launch screen in light and dark, push prompt + delivery (sandbox) + tap-to-screen including from a cold start, universal link from Notes, password AutoFill on /login, StoreKit purchase + restore in the sandbox, offline screen (airplane mode → launch → Retry).
- Archive, upload, TestFlight, submit.
