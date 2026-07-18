# Bacon — Design Review, UX Audit & Product Recommendations

**Product:** Bacon — an "overnight opportunity desk." A nightly sweep assembles real market signals (movers, sectors, macro, news, SEC insider clusters, community pulse) into a ranked morning brief; users can deep‑dive any name through eight professional lenses, track a self‑grading record, and monitor SG/AU property.
**Method:** I audited the actual implementation — every view component (`AppShell`, `TodayView`, `AnalyzeView`, `RadarView`, `NewsView`, `TrackRecordView`, `PropertyView`, `ChatPanel`, `CommandPalette`, login, welcome), the full `app/globals.css` design system, and the flows they encode — and computed WCAG contrast ratios directly from the design tokens. Where a judgment needs live‑browser confirmation (e.g. real‑device INP), I mark it. I did not sign up on the live deployment (no test credentials), so the first‑run narrative is reconstructed from the code paths, which are unambiguous.

**One‑line verdict:** A genuinely distinctive, well‑built product with a clear point of view and craft most early‑stage SaaS lacks — held back by (1) **no monetization surface exists at all**, (2) a first‑run that drops new users onto an empty screen with a single 30‑second button, and (3) a handful of concrete accessibility contrast failures. The craft is done; the growth scaffolding is missing.

---

## 1. Snapshot scorecard

| Area | Score | One‑line justification |
|------|:---:|--------|
| **First‑run & onboarding** | **2.5 / 5** | Good empty‑state copy, but a new account sees no brief, no checklist, no sample — just "Sweep now" and a 20–40s wait. No SSO; triple‑CTA login is ambiguous. |
| **Core workflow usability** | **4 / 5** | The "you open it to see what it found" model is executed cleanly; streaming, feedback, and error states are excellent. Mobile bottom bar is overloaded (6 tabs). |
| **Visual & interaction design** | **4.5 / 5** | "Daylight Instrument" is a strong, coherent system — consistent tokens, dark mode, skeletons, RAF‑throttled streaming, charming boot/loader. Real craft. |
| **Accessibility (WCAG AA)** | **2.5 / 5** | Good bones (focus states, reduced‑motion, ARIA, keyboard) undercut by measurable contrast failures on muted/accent/warn text and 40px (sub‑44px) touch targets. |
| **Conversion & monetization** | **1.5 / 5** | No pricing page, no paid tier, no paywall, no upgrade path anywhere. Nothing to convert to. Welcome page has no social proof. |
| **Copy & UX writing** | **4 / 5** | Distinctive, benefit‑led voice ("your overnight opportunity desk"). Occasional jargon (TAM‑Adj‑PEG, GF‑DMA) and a six‑vs‑eight‑lenses inconsistency. |
| **Trust, retention & habit** | **3.5 / 5** | Morning email + kill‑watcher + self‑grading record are strong habit hooks; PWA installable. But push isn't wired, and disclaimers are so frequent they slightly dampen confidence. |

**Single biggest opportunity:** Turn the already‑built power (8 lenses, red‑team, chain map, personas, property, email, watcher) into a **free‑vs‑paid structure with usage limits and a value‑moment paywall.** The product is monetizable *today*; there is simply no pricing surface. This is the highest‑leverage design work available and it unblocks the entire "convert free → paid" goal.

---

## 2. Prioritized issues (quick high‑impact wins first)

| ID | Impact | Effort | Area | Screen | Problem | Recommended change |
|----|:---:|:---:|------|--------|---------|--------------------|
| D1 | High | Low | Onboarding | Empty Today | New user sees empty brief; only path to value is a 30s "Sweep now" | Auto‑generate the first brief on first login, or show a **sample brief** with a "this is a demo — sweep yours" banner |
| D2 | High | Low | Conversion | (missing) | No pricing/upgrade surface exists | Add a `/pricing` page + "Upgrade" affordance; gate on usage (see §5) |
| D3 | High | Low | A11y | Global | `--muted` 4.07, `--accent` 3.05, `--warn` 2.82 contrast — below AA | Darken tokens (values in §6); ~1‑line CSS change |
| D4 | High | Med | Onboarding | Login | Triple‑CTA (Sign in / Create account / Magic link) is ambiguous; no SSO | Lead with one primary CTA; add Google SSO; split sign‑in vs sign‑up intent |
| D5 | Med | Low | Onboarding | First run | No guided next action after first brief | 3‑step checklist: *See your brief → Track a name → Run the lenses* |
| D6 | Med | Low | Copy | Analyze hero vs brand | "eight lenses" (UI) vs "six" (brand/README/welcome) | Reconcile to the real count (8); update `AnalyzeView.tsx:155` + welcome card |
| D7 | Med | Low | Navigation | Mobile | 6‑item bottom tab bar (Today/Record/Radar/News/Property/Analyze) is cramped | Collapse to 5: merge Record into Today, or move Property under a "More" |
| D8 | Med | Med | Conversion | Welcome/Login | No social proof, testimonials, or "who it's for" | Add a proof strip (even "built by an investor, used daily") + 1–2 concrete example briefs |
| D9 | Med | Low | A11y | Mobile | Touch targets 40px (< 44px WCAG 2.5.5) | Bump `.pr-btn-sm/.pr-tv/.pr-mailtoggle` min‑height to 44px |
| D10 | Med | Med | Retention | PWA | Installable but no push notifications; "brief is ready" only via email | Wire Web Push for "your brief is ready" + kill‑alerts |
| D11 | Low | Low | A11y | Streaming views | Only one `aria-live`; streamed briefs aren't announced | Add `aria-live="polite"` to the brief/lens containers |
| D12 | Low | Low | Trust | Everywhere | Disclaimer density is high enough to read as hedging | Consolidate to one persistent, calm disclaimer per view |
| D13 | Low | Med | Conversion | Analyze | Pro‑caliber tools (red‑team, chain, personas) given free to everyone with no "this is premium" framing | Soft‑gate as Pro with a locked‑preview so free users see what they'd get |

---

## 3. Top 10 fixes with detail

### 1. (D1) First brief on an empty account — kill the blank slate
**Current:** A brand‑new user lands on **Today** (`TodayView.tsx`). The nightly cron hasn't run for them (auto‑sweep defaults off, `scout_interval_minutes = 0`), so `GET /api/brief` returns nothing and they see the empty state: *"The system hunts while you're away… hit Sweep now."* Their only route to the aha moment is clicking **Sweep now** and waiting 20–40s watching a bouncing bacon.
**Proposed:** On first login with no brief, either (a) kick off a sweep automatically so value is materializing while they read the welcome copy, or (b) render a **pre‑baked sample brief** (clearly labeled "example") with a single CTA: "Now sweep today's real signals →". Seeing three convergent opportunities *before* committing 30 seconds is the difference between "I get it" and a bounce.
**Why it moves a metric:** Time‑to‑first‑value and activation. The aha moment ("it found things I wouldn't have") currently sits behind a cold 30s wait with no preview.

### 2. (D2/D13) Ship a monetization surface
**Current:** There is no pricing page, no plan concept, no "Upgrade," no paywall, and no gated feature anywhere in the codebase. Every feature — 8 lenses, red‑team, chain map, personas, property tracker, morning email, kill‑watcher — is free and ungated. The stated goal is to convert free users to paid; there is nothing to convert *to*.
**Proposed:** Introduce **Free vs Pro** (see §5 for the teardown). Reuse the daily‑usage counter the code review recommends as the paywall meter. Add a `/pricing` page and an "Upgrade" entry in the user menu and at each value moment.
**Why it moves a metric:** It is the entire free→paid funnel. Impact is unbounded because the current conversion rate is structurally 0%.

### 3. (D3/D6) Accessibility contrast + the lens‑count inconsistency
**Current (measured from tokens):** In light theme, `--muted` (#7C6B52) on `--paper` is **4.07:1** (AA body needs 4.5), the safety‑orange `--accent` (#EE4310) on paper is **3.05:1**, and `--warn` (#BE8A2C) on card is **2.82:1** — the "AI OPINION" status pill and nudges fail even the 3:1 UI threshold. Separately, the Analyze hero says "**eight** professional lenses" while the README, brand line, and welcome card say "**six**" (the `LENSES` array actually has 8).
**Proposed:** Darken the three tokens (concrete hex in §6) — a one‑line change that lifts dozens of labels/hints/links over AA at once. Reconcile the lens count to 8 everywhere.
**Why it moves a metric:** Accessibility (legal + real users on phones in daylight — ironic for a "Daylight Instrument"). The lens inconsistency is a small credibility ding on the most‑viewed screen.

### 4. (D4) Reduce signup friction
**Current:** The login card presents three buttons — **Sign in**, **Create account**, **Email me a magic link** — plus a password field. A new visitor can't tell which is "for me," and email/password with a 6‑char minimum is the only path (no Google/GitHub SSO). The confirmation copy hedges: *"If email confirmation is on in Supabase, confirm via the email, then sign in — otherwise just sign in now."*
**Proposed:** Split intent — a primary "Create account" CTA for new users (magic link as the low‑friction default), "Sign in" secondary. Add **Google SSO** (biggest single friction reducer for this ICP). Rewrite the confirmation copy to one confident sentence.
**Why it moves a metric:** Visitor→signup conversion. Every field and every ambiguous button is measurable drop‑off.

### 5. (D5) A first‑action checklist
**Current:** After the first brief lands, there's no guided next step. Power is discoverable but not directed.
**Proposed:** A dismissible 3‑step checklist on Today for new accounts: **① See today's brief ② Track a name ③ Run the eight lenses on one.** Each step deep‑links. Ends at the habit loop (track → return to see how it aged).
**Why it moves a metric:** Activation and D1/D7 retention — guided first actions correlate with return.

### 6. (D7) De‑clutter the mobile bottom bar
**Current:** `AppShell.tsx` renders a 6‑item bottom tab bar (Today, Record, Radar, News, Property, Analyze). Six targets in a phone‑width bar means ~62px each — tight, and it competes with the ⌘K/search affordance.
**Proposed:** Cap at 5. Merge **Record** into a segment under Today (the DiscoverView already has an in‑page segmented control), or tuck **Property** behind a "More." Keep Today, Analyze, Radar, News + one.
**Why it moves a metric:** Core‑workflow usability and mis‑tap rate on mobile (the PWA's primary form factor).

### 7. (D8) Add trust/proof to Welcome + Login
**Current:** The welcome page is well‑written and benefit‑led, but carries zero social proof — no testimonial, no "used by," no example output, no founder story beyond the tagline. Login has none either.
**Proposed:** Add a proof strip (a real quote, a "built by an investor who uses it daily," or a live count of briefs generated) and embed **one concrete example brief** so the value is shown, not just described.
**Why it moves a metric:** Signup conversion and paid trust — "credible enough that someone would pay" (the review's own bar).

### 8. (D10) Web Push for "your brief is ready"
**Current:** Bacon is an installed PWA (`manifest.ts`, `sw.js`, install guide) but re‑engagement depends on the optional morning **email**. There's no push.
**Proposed:** Wire Web Push: "Your morning brief is ready" and kill‑condition alerts as notifications. The service worker already exists; this is the missing half of the retention loop for installed users.
**Why it moves a metric:** D1/D7 retention — a reason to come back that doesn't depend on inbox placement.

### 9. (D13) Soft‑gate the pro‑caliber analyses
**Current:** Red team, Chain map, and Investor takes (`AnalyzeView` sub‑nav) are premium‑feeling features handed to everyone with no "this is special" framing.
**Proposed:** Under the Free/Pro split, show these as **locked previews** for free users (blurred first line + "Pro"). Free users learn what they're missing at the exact moment they'd want it.
**Why it moves a metric:** Free→paid — discoverable paid value at the value moment beats a settings‑page upsell.

### 10. (D11/D12) Screen‑reader announcements + calmer disclaimers
**Current:** Streamed briefs/lenses update the DOM live but only one `aria-live` region exists, so screen‑reader users may not hear results arrive. Separately, "Not financial advice / verify yourself" appears many times per view.
**Proposed:** Add `aria-live="polite"` to the brief and lens containers. Consolidate disclaimers to one calm, persistent line per view (a footer), so it reads as principled rather than nervous.
**Why it moves a metric:** Accessibility + perceived confidence/trust.

---

## 4. Feature recommendations

### Activation boosters (get new users to first value)
| Feature | Problem it solves | Metric | Effort | When |
|---|---|---|---|---|
| **Sample/auto‑first brief** (D1) | Blank empty state on day one | Activation, TTFV | Low | **Now** |
| **First‑action checklist** (D5) | No guided next step | Activation, D1 retention | Low | **Now** |
| **Seed default themes on signup** | Scout needs themes to shine; new accounts have none | Activation | Low | **Now** |
| **Google SSO** (D4) | Password friction | Signup rate | Med | **Now** |
| **"Analyze this" from a pasted ticker list** | Faster path to the power feature | Activation | Med | Later |

### Conversion / monetization (create clear paid value)
| Feature | Problem it solves | Metric | Effort | When |
|---|---|---|---|---|
| **Free vs Pro + usage meter** (D2) | Nothing to convert to | Paid conversion, MRR | Med | **Now** |
| **Value‑moment paywall** (locked red‑team/chain/personas, D13) | Upsell isn't at the value moment | Free→paid | Med | **Now** |
| **Pro: morning email + kill‑watcher + property** | Bundle the "owned‑channel" and long‑horizon features as Pro | ARPU | Low | **Now** |
| **Pricing page with anchoring** (D2/D8) | No price clarity or anchoring | Conversion | Low | **Now** |
| **Annual plan / founder's‑rate** | Cash + commitment | LTV | Low | Later |

### Retention / expansion (reasons to stay and spend more)
| Feature | Problem it solves | Metric | Effort | When |
|---|---|---|---|---|
| **Web Push** (D10) | Re‑engagement depends on email | D7/D30 retention | Med | **Now** |
| **Weekly "how your briefs aged" digest** | Closes the credibility loop proactively | Retention | Med | Later |
| **Streaks / "briefs seen" progress** | Habit formation | DAU/WAU | Low | Later |
| **Shareable brief cards ("made with Bacon")** | PLG loop + proof | Referral, signups | Med | Later |
| **Portfolio import / more markets** | Expansion surface for property + equities | Expansion MRR | High | Later |

**Cut scope where a simpler version gets 80%:** the paywall is just the daily‑usage counter + a modal — don't build entitlements infrastructure first. Web Push can start as brief‑ready only. The checklist is three `localStorage` flags, not a tour engine.

---

## 5. Conversion teardown (lift free → paid)

**The core problem:** the funnel has no paid stage. Everything below assumes you introduce **Free vs Pro** first.

- **Landing (Welcome):** Strong pitch, zero proof and no price. Add (1) one concrete example brief above the fold, (2) a proof strip, (3) a "Free / Pro" comparison with the primary CTA "Start free," and (4) benefit‑led plan bullets (not feature lists).
- **Signup:** Cut friction (D4) — Google SSO, magic‑link default, one clear primary CTA. Defer any email verification until *after* the first brief so nothing walls the aha moment.
- **Paywall placement — at the value moment, not settings:**
  - Free = **N briefs/week + M deep analyses/week** (reuse the usage meter). The (N+1)th shows a "You've used this week's free analyses — go Pro for unlimited" inline card, not a redirect.
  - Free gets the **Lens cockpit**; Pro unlocks **Red team, Chain map, Investor takes** as locked previews (D13) so the value is visible.
  - Pro owns the **owned‑channel retention features**: morning email, kill‑condition watcher, property tracker, Web Push.
- **Pricing page:** Two tiers, anchor Pro against "one bad trade," monthly + annual (annual anchored as default), one‑sentence objection handling ("cancel anytime · not financial advice · your data is yours"), and the self‑grading track record as social proof of the product's honesty.
- **Upgrade nudges:** Trigger on *usage*, not time — when a user hits the weekly cap, or opens a locked analysis, or their tracked name triggers a kill they didn't get pushed. Copy should be helpful ("you're clearly using this") not nagging.
- **Trust to close:** the **self‑grading record** is a rare, honest asset — feature it on pricing ("we grade our own calls; see for yourself"). Add security/privacy line ("your watchlist is yours, RLS‑isolated") — the code backs this up.

---

## 6. Accessibility quick‑fix list (cheap AA wins)

Measured contrast ratios (WCAG: body text ≥ 4.5, large text/UI ≥ 3.0):

| Token | On | Ratio | Verdict | Fix |
|---|---|---|---|---|
| `--muted` `#7C6B52` | `--paper` | **4.07** | ✗ body | Darken to ~`#6B5A42` (→ ~5.1) |
| `--muted` `#7C6B52` | `--card` | 4.74 | ✓ | ok |
| `--muted2` `#8C7A5F` | `--card` | 3.82 | ✗ body | Darken to ~`#7A684E` |
| `--accent` `#EE4310` | `--paper` | **3.05** | ✗ body text/links | Use `--accent2` `#CC3608` (3.86) for text, or darker for body copy; keep bright orange for large/decorative only |
| `--warn` `#BE8A2C` | `--card` | **2.82** | ✗ even UI | Darken to ~`#9A6E1E` (→ ~4.0) — affects the "AI OPINION" status pill + nudges |
| `--good` `#2E8B57` | `--card` | 3.91 | ✗ body | ok for large/arrows; darken for small "constructive" labels |
| Dark `--muted2` `#8A7B62` | `--card` | 3.87 | ✗ small body | Lighten to ~`#9C8C70` |

Other cheap fixes:
- **Touch targets (D9):** bump `.pr-btn-sm`, `.pr-tv`, `.pr-mailtoggle` from `min-height:40px` to `44px` (WCAG 2.5.5).
- **`aria-live` (D11):** add `aria-live="polite"` to the streaming brief and lens grids so results are announced.
- **Non‑color signaling:** up/down already pair color with ▲▼ arrows (good); ensure the stance LED bank keeps its text label (it does) so colorblind users aren't reliant on the dot hue.
- **Already good (keep):** `prefers-reduced-motion` is honored throughout, focus styles exist, inputs/`<select>` carry `aria-label`, modals use `aria-modal`, the boot animation is gated. Solid baseline.

---

## 7. 30 / 60 / 90 design roadmap

**Days 0–30 — unblock activation & monetization (the two structural gaps):**
- D1 sample/auto‑first brief · D5 first‑action checklist · seed default themes.
- D2 Free/Pro split + usage‑meter paywall + `/pricing` page (design + copy).
- D3 contrast token fix + D6 lens‑count reconciliation + D9 touch targets (a batch of ~30‑min a11y wins).
- D4 login: single primary CTA + Google SSO.

**Days 31–60 — proof, retention, and the value‑moment upsell:**
- D8 welcome/login proof strip + one embedded example brief.
- D13 locked‑preview gating on red‑team/chain/personas; usage‑triggered upgrade nudges.
- D10 Web Push (brief‑ready + kill‑alerts).
- D7 mobile bottom‑bar reduction; D11/D12 aria‑live + disclaimer consolidation.

**Days 61–90 — habit, referral, expansion:**
- Weekly "how your briefs aged" digest; streaks/progress.
- Shareable brief cards with "made with Bacon" attribution (PLG loop).
- Annual plan + founder's rate; pricing A/B test.
- Expansion surfaces: more property markets / equities portfolio import (scoped small).

**Guiding principle:** the product's *craft* is already at a paid bar. The next 90 days of design is not polish — it's building the **activation on‑ramp** and the **paid structure** that the excellent core has been missing.
