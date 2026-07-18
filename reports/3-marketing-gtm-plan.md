# Bacon — Marketing & Go‑To‑Market Plan (+ Campaign Kit)

**Context:** Early‑stage web SaaS (Next.js + Supabase), live with a handful of users. Goal: grow signups and convert free → paid on a lean budget.
**Note on numbers:** "Current numbers" below are the real production state (from the app's Supabase project) as of this review. They're deliberately honest — this is a pre‑traction product, and the plan is written for that reality, not a vanity version of it.

> **Prerequisite that gates everything paid:** Bacon currently has **no paid tier, pricing page, or paywall** (confirmed in the design review). Part A assumes you ship the Free/Pro split described in §Pricing before running the trial‑to‑paid work. Everything else (positioning, content, community, launch, lifecycle onboarding) can start immediately.

---

## PART A — The Plan

### 0. Inputs (filled)

- **Product in one sentence:** Bacon is an automated investment‑research desk that sweeps the market overnight and hands self‑directed investors a ranked morning brief of under‑the‑radar opportunities — each deep‑divable through eight professional lenses — as a research and thinking tool, not an advisor.
- **Ideal customer profile (ICP):**
  - *Primary:* **Self‑directed "prosumer" retail investors**, 25–50, who actively manage their own brokerage account, follow markets daily, and read fintwit — but have no Bloomberg terminal, analyst team, or disciplined process. They live on r/investing, r/stocks, r/SecurityAnalysis, X/fintwit, investing Discords, and Indie Hackers (many are also builders).
  - *Secondary:* **SG/AU investors** (the property tracker is a wedge no US‑centric tool has) and **the build‑in‑public crowd** who'll adopt a well‑crafted indie tool.
- **The #1 pain removed:** *"What should I even be looking at today?"* — the signal‑vs‑noise overwhelm, the FOMO on opportunities they'd never surface alone, and the lack of a repeatable way to pressure‑test an idea before risking money.
- **Top 3 alternatives + differentiator:**
  - *Seeking Alpha* (crowded opinion, paywalled, noisy) · *Simply Wall St* (pretty but single‑view, no "what's timely today") · *generic ChatGPT* (will happily fabricate a price target).
  - **Why Bacon is different:** it's **push, not pull** (it finds ideas *for* you overnight — you open it to see what it found, you don't search); **convergence‑based** (conviction only where independent lenses agree, never one indicator); and **radically honest** — it *never invents a number*, paraphrases + attributes news, and **grades its own past calls**. "The research tool that refuses to make numbers up" is a category of one.
- **Pricing (proposed):**
  - **Free** — the daily brief + Lens cockpit (8 lenses), limited to *N briefs + M deep analyses per week*; Radar tracking.
  - **Pro — ~$18/mo or $144/yr (33% off):** unlimited briefs/analyses, the premium analyses (Red team, Chain map, Investor takes), morning email + Web Push, kill‑condition watcher, and the SG/AU property tracker.
  - Founder's rate for the first 100 paying users (lifetime lock).
- **Current numbers (real):** ~**2 users**, **5 briefs** generated, **14 scout picks**, 4 chat messages, **1** user with auto‑sweep on, **0 tracked names**, **0 paid**, **$0 MRR**. Top acquisition source: **none yet** (pre‑launch). This is a message‑market‑fit stage, not a scaling stage.
- **Budget & time (lean default):** assume **~$300/mo** (domain, email/Resend, minimal tooling; paid ads held until organic converts) and **~10–15 founder hours/week**.

### 1. Positioning & messaging

**Positioning statement:**
> For self‑directed investors who are drowning in noise and afraid of missing the move, **Bacon** is an overnight research desk that surfaces the under‑the‑radar opportunities where independent signals converge — unlike screeners and hot‑take newsletters, it comes to you, shows its reasoning across eight lenses, and never invents a number.

**Three messaging pillars (repeat everywhere):**
1. **It finds, you don't search.** Wake up to a ranked brief, not a blank query box.
2. **Convergence, not a hot take.** Conviction only where independent lenses agree — with the confirm/kill lines spelled out.
3. **Honest by design.** Real data only, sources cited, and it grades its own calls. No fabricated prices, ever.

**Hero value prop:** *"Your overnight opportunity desk. While you sleep, Bacon reads the tape and hands you tomorrow's ideas — with the reasoning, and without the hype."*

**Three supporting benefits (benefit‑led):**
- *Never miss the setup you'd never have found* — second‑order names the tape hasn't repriced yet.
- *Know why, and what would break it* — every idea ships with converging signals + a kill condition.
- *Trust what you read* — it cites sources, flags unverified figures, and keeps a public scorecard of how its calls aged.

**Why now / why you:** AI made it trivial to generate confident‑sounding market takes — and worthless ones. Bacon is the counter‑position: an AI research tool with *discipline* — convergence, sourcing, and self‑grading — built by someone who actually invests and got tired of tools that either fabricate or overwhelm.

### 2. North‑star & funnel metrics

- **North star:** **Weekly Activated Users** = users who, in a week, view/generate ≥1 brief **and** take one action (track a name or run the lenses). It captures the real habit; MRR is the lagging business metric.
- **Funnel:** Visitor → Signup → **Activated** (first brief + first action) → **Habituated** (returns 2+ weeks) → Paid → Retained → Referred.
- **90‑day targets (deliberately modest from a base of ~2):**
  - 1,500 visitors → 150 signups (10%) → 60 activated (40% of signups) → 25 habituated → **8–12 paid** → first 2–3 referrals.
  - Instrument every stage with Supabase events (see §Metrics plan). *You can't grow what you don't measure — do this in week 1.*

### 3. Channel strategy (go deep on 2, seed a 3rd)

Ranked for this ICP:
1. **Community & founder‑led (primary).** The ICP lives in r/investing, r/stocks, r/SecurityAnalysis, fintwit/X, and Indie Hackers. Be genuinely useful — post real briefs, teardown threads, "here's how the tool graded its own calls." No spam; earn the right to link. This is where message‑market fit gets found.
2. **Content/SEO (primary, compounding — start now).** Bottom‑of‑funnel comparison + JTBD pages. Compounds while you sleep, like the product.
3. **Launch platforms (spike, week 7–8).** Product Hunt + Show HN + a coordinated Reddit day. One well‑prepared launch, not a drive‑by.
- *Product‑led loop (build in parallel):* shareable brief cards with a subtle "made with Bacon."
- *Lifecycle email (highest ROI once signups flow):* onboarding → activation → trial‑to‑paid → win‑back.
- *Paid: hold* until organic proves the message converts, then a small tightly‑targeted test (Reddit/X) with a payback target.

### 4. Conversion & monetization plan

- **Landing page:** clear value prop above the fold, one embedded **example brief** (show, don't tell), one primary CTA ("Start free"), proof strip, objection handling, fast load (you're on Vercel — treat it as a living A/B asset).
- **Free→paid:** place upgrade prompts at the **value moment** — when a free user hits the weekly cap, opens a locked Red‑team/Chain‑map preview, or their tracked name triggers a kill they didn't get pushed. Usage‑triggered, not time‑triggered.
- **Reduce signup friction:** Google SSO + magic‑link default; defer email verification until after the first brief; minimal fields.
- **Trust:** feature the **self‑grading track record** as proof of honesty, add testimonials as they arrive, a real changelog, and the "your data is yours (RLS‑isolated)" line.

### 5. 90‑day roadmap (sequenced)

- **Weeks 1–2 — Foundation:** ship Free/Pro + pricing page; rewrite landing with an example brief; instrument Supabase funnel events + a dashboard; onboarding email #1–2 live; positioning locked.
- **Weeks 3–6 — Engine on:** publish 1–2 SEO/content pieces per week; daily founder presence in 2 communities; ship shareable brief cards (referral loop); full lifecycle emails live; prep launch assets.
- **Weeks 7–10 — Launch & amplify:** coordinated Product Hunt + Show HN + Reddit launch; collect testimonials; double down on the best‑performing channel; start one small paid test only if the message is converting.
- **Weeks 11–13 — Optimize & scale:** cut what's flat, scale what works; A/B the paywall placement and price; build the second content moat (the SG/AU property angle); report funnel vs targets.

### 6. Budget allocation (lean)

~**60%** founder time into the top organic channel (community + content), ~**20%** into lifecycle/PLG (emails + shareable cards), ~**20%** reserved for a small paid test *after* organic proves the message. Cash mostly goes to domain, Resend, and (later) the paid test.

### 7. Reporting cadence

- **Weekly:** funnel numbers vs target, what shipped, what to double‑down/kill.
- **Monthly:** channel CAC & payback, activation & free→paid rates, retention cohort, next‑month plan.

---

## PART B — Campaign Kit (ready to run)

> Voice: confident, plain‑spoken, a little wry — the "Daylight Instrument" brand. Benefit‑led, specific, never hypey (hype is the enemy Bacon positions against). Every asset ends in a clear next action. Honesty rules are non‑negotiable and are themselves the marketing: real data only, "not financial advice," paraphrase+attribute news, TradingView attribution.

### 1. Positioning & messaging doc

**Positioning statement:** *(see Part A §1).*

**Three messaging pillars:** It finds, you don't search · Convergence, not a hot take · Honest by design.

**Value prop:** *Your overnight opportunity desk — tomorrow's ideas, with the reasoning, without the hype.*

**5 headline options:**
1. *Wake up to what the market's about to notice.*
2. *An overnight research desk that never invents a number.*
3. *Stop screening. Start seeing what it found.*
4. *Eight lenses. One brief. Zero hype.*
5. *The AI research tool with a conscience — it grades its own calls.*

**Elevator pitch:**
- **25 words:** Bacon sweeps the market overnight and hands self‑directed investors a ranked morning brief of under‑the‑radar ideas — with the reasoning, sourced, and never a fabricated number.
- **50 words:** Bacon is your overnight opportunity desk. While you sleep it reads the movers, the macro, the filings and the tape, then surfaces the ideas where independent signals converge — each with confirm/kill lines and eight‑lens depth. It cites sources, refuses to invent numbers, and grades its own past calls. Research, not advice.
- **100 words:** Most market tools either overwhelm you with a blank screener or hand you a confident hot take that's secretly made up. Bacon does neither. Overnight, it assembles the day's real signals — movers, sector rotation, macro, paraphrased headlines, SEC insider clusters, community sentiment — and pieces them into a ranked morning brief of under‑the‑radar opportunities, including the second‑order names the tape hasn't repriced. Open any one and run it through eight professional lenses; conviction comes only where they converge. Every figure is sourced or flagged, and Bacon keeps an honest, self‑grading record of how its calls aged. A thinking tool — not an advisor.

### 2. Landing page copy (conversion‑ + SEO‑aware)

**Hero**
- **H1:** Wake up to what the market's about to notice.
- **Sub:** Bacon is your overnight opportunity desk. While you sleep, it reads the tape — real movers, macro, filings, sentiment — and hands you a ranked morning brief of under‑the‑radar ideas, with the reasoning and without the hype.
- **Primary CTA:** Start free — see today's brief · **Secondary:** See an example brief ↓

**Proof strip:** *Real data only · Sources cited · Grades its own calls · Not financial advice*

**Benefit section 1 — It finds, you don't search.**
No blank query box. Every morning Bacon sweeps the market and surfaces the opportunities where independent signals converge — including the second‑order names most people miss. You open it to *see what it found*.

**Benefit section 2 — Know why, and what would break it.**
Each idea ships with its converging signals, a horizon, and an explicit **kill condition**. Go deeper with eight professional lenses — Fundamental, Valuation, Technical, Trend‑health, Factor, Macro, Smart‑money, Risk — and conviction only where they agree.

**Benefit section 3 — Honest by design.**
Bacon never invents a price. Figures are sourced or flagged for you to verify; headlines are paraphrased and attributed; charts are live via TradingView. And it keeps a public scorecard of how its past calls aged. Trust you can check.

**Benefit section 4 — Built for how you actually invest.**
Installs on your phone like an app. Track names and get a monitoring update as their story evolves. A kill‑condition watcher comes and finds you when a thesis breaks. (Investing in SG/AU property too? Bacon tracks those markets — nobody else does.)

**Social proof placement:** below benefit 2 (once you have quotes) — 2–3 short testimonials + "briefs generated" counter.

**FAQ / objections**
- *Is this financial advice?* No — it's a research and thinking tool. It surfaces what each lens sees and what to verify; you own every decision.
- *Does it make up prices like ChatGPT?* Never. Real numbers come from real providers and live search, always attributed; anything unsourced is flagged.
- *Do I have to configure it?* No. It works out of the box and gets sharper as you add themes and track names.
- *What does Pro get me?* Unlimited briefs/analyses, the premium tools (Red team, Chain map, Investor takes), email + push, the kill‑watcher, and the property tracker.

**Primary CTA (repeat):** Start free — your first brief is one click away. · **Secondary:** See pricing.

### 3. 90‑day content calendar (weekly, mapped to funnel + keyword)

| Wk | Funnel | Target keyword / intent | Title | Angle (one line) |
|---|---|---|---|---|
| 1 | TOFU | "how to find undervalued stocks" | How to find opportunities before the market reprices them | The second‑order thinking most screeners can't do. |
| 2 | BOFU | "seeking alpha alternative" | 5 honest Seeking Alpha alternatives (and when each wins) | Position Bacon as the "never fabricates" option. |
| 3 | MOFU | "how to pressure test a stock idea" | The 8‑lens checklist I run before buying anything | The convergence method, as a usable framework. |
| 4 | TOFU | "AI stock research reliable?" | Why most AI stock tools lie to you (and how to catch them) | The fabrication problem → Bacon's sourcing/flagging. |
| 5 | BOFU | "simply wall st alternative" | Simply Wall St vs a push‑based research desk | Pull vs push; timeliness. |
| 6 | MOFU | "insider buying signal" | What clustered insider buying actually tells you | Educational; ties to Bacon's SEC signal. |
| 7 | Launch | brand | Launch week: what Bacon is and why I built it | Founder story + launch CTA (PH/Show HN). |
| 8 | TOFU | "macro backdrop investing" | Reading the macro backdrop without a terminal | Rates/curve/VIX explained; Bacon's macro strip. |
| 9 | MOFU | "how to track a stock thesis" | Track the thesis, not just the price | Kill conditions + monitoring; retention hook. |
| 10 | BOFU | "koyfin alternative for retail" | Koyfin is great — here's what it doesn't do | The "what should I look at today?" gap. |
| 11 | TOFU | "singapore property price trend 2026" | Where SG + AU housing actually is (real indices) | The property wedge; SG/AU SEO. |
| 12 | Proof | brand | We graded 90 days of Bacon's own calls. Here's the scorecard. | Radical honesty as content; conversion proof. |
| 13 | MOFU | "value momentum quality factors" | The five factors, in plain English | Evergreen; feeds the Factor lens. |

*Repurpose each post into an X thread + a LinkedIn post + one Reddit comment where relevant. One piece → four surfaces.*

### 4. Launch kit

**Product Hunt**
- **Tagline:** Your overnight opportunity desk — tomorrow's ideas, without the hype.
- **Description:** Bacon sweeps the market while you sleep — real movers, macro, filings, sentiment — and hands you a ranked morning brief of under‑the‑radar opportunities. Open any one and run it through eight professional lenses; conviction only where they converge. It never invents a number, cites its sources, and grades its own past calls. A research tool, not an advisor. Free to start; Pro unlocks unlimited analyses, red‑team + chain‑map depth, alerts, and a SG/AU property tracker.
- **First comment (maker):** Hi PH 👋 I'm the maker. I built Bacon because every market tool I tried either drowned me in a blank screener or handed me a confident AI "price target" that was quietly made up. Bacon is the opposite bet: it *comes to you* each morning, shows its reasoning across eight lenses, refuses to fabricate a single number, and keeps a public scorecard of how its calls aged. It's a thinking tool, not advice. I'd love feedback on the brief itself — is it finding things you wouldn't have? AMA on the honesty constraints, the convergence method, or the stack (Next.js + Supabase). 🥓

**Show HN**
- **Title:** Show HN: Bacon – an overnight market research desk that never fabricates a number
- **Body:** I got tired of AI market tools that either overwhelm you with a screener or hallucinate price targets, so I built Bacon. Overnight it assembles real signals — movers, sector rotation, FRED macro, paraphrased+attributed headlines, SEC Form‑4 insider clusters, and a community sentiment pulse — and synthesizes a ranked morning brief of under‑the‑radar ideas, including second‑order names. Every idea carries converging signals + an explicit kill condition. You can run any name through eight lenses, and conviction is convergence‑based, never one indicator. The hard rule: it never invents a figure — real numbers come from real providers/live search and are attributed; anything unsourced gets flagged in a "data check." It also grades its own past calls against real prices + SPY, so the track record is honest. Stack: Next.js 16 on Vercel, Supabase (Postgres/Auth/RLS), Anthropic with web_search, keyless price data (Stooq/Yahoo). It's a research/thinking tool, explicitly not advice. Happy to go deep on the convergence prompt design, the "no fabricated data" enforcement, or the calibration loop.

**3 community posts (native, per‑community, non‑spammy)**
- **r/investing** (lead with value, not the product): *"I built a checklist that forces me to pressure‑test an idea across 8 lenses before buying — sharing the framework."* Post the actual framework; mention in a comment (if asked) that you built a tool that automates it, with a link. Karma‑safe.
- **r/singaporefi or r/AusFinance** (the wedge): *"Pulled the real HDB/URA (and ABS) property indices into one view with rent‑vs‑mortgage carry math — feedback on the outlook logic?"* Native to the SG/AU audience no US tool serves.
- **Indie Hackers:** *"Building an investment‑research tool with a hard 'never fabricate a number' rule — here's how I enforce it technically."* Build‑in‑public angle; the constraint is the story.

**Launch‑day checklist**
- [ ] Landing page + example brief live and fast (Lighthouse ≥ 90); pricing page up.
- [ ] Signup friction removed (SSO/magic link; verification deferred).
- [ ] Funnel events firing; dashboard open on a second monitor.
- [ ] Onboarding email #1 triggers on signup.
- [ ] PH scheduled 12:01am PT; Show HN posted ~9am ET; Reddit posts staggered, not simultaneous.
- [ ] Maker comment + first 5 replies drafted; notifications on.
- [ ] 8–10 friendly early users primed to try + comment honestly (not fake upvotes).
- [ ] Status page / capacity check (cron + AI cost); daily usage cap on (cost guardrail).
- [ ] Post‑launch: DM everyone who engaged, ask for one piece of feedback.

### 5. Lifecycle email sequences

**(a) Onboarding / activation — 4 emails**
1. **T+0min · Subject: "Your desk is open 🥓"** — Welcome; one line on what to expect; single CTA: *Generate your first brief*. *Exit if:* user already generated a brief.
2. **T+1day (if not activated) · "The market moved last night. Here's what to look at."** — Nudge to run the first sweep; show a sample brief snippet. *Exit if:* activated.
3. **T+3days (if activated) · "Go one lens deeper"** — Teach the 8‑lens deep dive on a name they tracked (or a popular one); CTA: *Run the lenses*. *Exit if:* has run an analysis.
4. **T+7days · "Track the thesis, not just the price"** — Introduce tracking + the kill‑watcher; set the habit. CTA: *Track your first name*. *Trigger:* 7 days post‑signup, regardless.

**(b) Trial‑to‑paid — 4 emails** *(triggered when a free user first hits a Pro moment)*
1. **On first paywall hit · "You've clearly got the habit"** — Acknowledge usage; show what Pro unlocks (unlimited + red‑team/chain/personas + alerts + property). CTA: *See Pro*. *Exit if:* upgraded.
2. **T+2days · "The two tools I reach for most"** — Red team + Chain map, with a real example of a thesis they'd have caught. CTA: *Unlock the deep tools*.
3. **T+4days · "It graded its own calls. Would you?"** — Lead with the honesty scorecard as the reason to trust (and pay). CTA: *Go Pro*.
4. **T+6days · "Founder's rate closes soon"** — Scarcity done honestly (first‑100 lifetime rate). CTA: *Lock your rate*. *Exit if:* upgraded.

**(c) Win‑back — 3 emails** *(trigger: no login 21 days)*
1. **T+21days · "You missed a few mornings"** — Show 2–3 of the best briefs they missed (real ones). CTA: *See this morning's brief*.
2. **T+28days · "What would make Bacon worth opening daily?"** — One‑question reply‑to email; genuine feedback ask (also churn research). *Exit if:* replies or logs in.
3. **T+35days · "We'll keep your desk warm"** — Soft goodbye + a "come back anytime" + pause emails. Leaves the door open without nagging.

### 6. Social content

**10 LinkedIn posts** (education + build‑in‑public + soft CTA)
1. "Most AI market tools have one fatal flaw: they'll invent a price target and say it with confidence. Here's the rule I built my product around instead — never assert a number without a source." (+ how the data‑check works)
2. "Screeners answer 'which stocks match these filters.' The harder question is 'what should I even be looking at today?' That's a push problem, not a pull problem." 
3. Build‑in‑public: "0 → first paying users. Here's the exact funnel I'm instrumenting and why activation ≠ signup."
4. "Conviction should come from convergence, not one indicator. A walkthrough of the 8 lenses and why unanimity is the signal."
5. "I made my product grade its own past calls against real prices + SPY. It's humbling — and it's the most honest marketing I have."
6. "Second‑order thinking, with an example: the obvious winner vs the three names the tape hasn't repriced yet."
7. "Why I defer email verification until after the first 'aha.' A small onboarding change, a real activation lift." (once you have the data)
8. "Kill conditions > price targets. If you can't say what would break your thesis, you don't have one."
9. "The SG/AU property angle nobody builds: real HDB/URA/ABS indices + rent‑vs‑mortgage carry, in one view."
10. Soft CTA: "Bacon is open and free to start. If you've ever wished someone handed you a researched morning brief instead of a blank screener — that's the whole idea. Link in comments."

**10 X/fintwit posts**
1. "screeners: here are 5,000 rows, good luck. bacon: here are the 5 things worth your attention this morning, and why. 🥓"
2. "rule #1 of the product: never fabricate a number. every figure is sourced or flagged. novel concept for an AI tool, apparently."
3. "conviction = convergence. one green indicator is noise. eight lenses agreeing is a signal. 🧵"
4. "we grade our own calls vs SPY and publish it. most tools would never. that's exactly why we do."
5. "the opportunity you'll never find is the second‑order one. example 👇"
6. "'what would break this thesis?' if you can't answer, it's not a thesis, it's a hope."
7. build‑in‑public: "2 users → building in public. today's lesson: activation is the metric, not signups."
8. "insider *clusters* > a single Form 4. what clustered open‑market buying actually tells you 🧵"
9. "it comes to you. you don't search bacon, you open it to see what it found overnight."
10. soft CTA: "free to start. your first morning brief is one click. 🥓 [link]"

### 7. Referral / PLG mechanic

**Shareable brief card ("made with Bacon").**
- **Trigger:** after a user views a brief or a completed 8‑lens analysis, a "Share this read" button generates a clean image/opengraph card — the idea name, the converging signals, the horizon, the kill line — footed with a subtle *"made with Bacon · baconapp.com"*.
- **Incentive (two‑sided, honest):** the sharer and anyone who signs up via their card both get **a month of Pro** (or +N free deep analyses/week). No cash bribes — the reward is more of the product.
- **Copy on the card CTA:** *"See what Bacon found this morning →"*
- **Why it fits:** the output is inherently shareable on fintwit (that's where the ICP already argues about tickers), the attribution rides real value (a good call ages well and markets itself), and it respects the honesty rules — the card shows sourced reasoning, not a fabricated target.

### 8. Metrics plan

**Events to instrument (Supabase — you already own the data layer):**
- `signup` (method: sso/magic/password), `first_brief_generated`, `brief_viewed`, `analysis_run` (lens/debate/redteam/chain/personas), `name_tracked`, `theme_added`, `property_added`, `paywall_viewed` (surface), `upgrade_started`, `upgrade_completed`, `email_opt_in`, `push_opt_in`, `brief_reviewed`, `referral_shared`, `referral_converted`.

**Funnel dashboard layout (one screen):**
- Row 1 — **Acquisition:** visitors → signups (by source), signup conversion %.
- Row 2 — **Activation:** signup → first_brief → first_action (track/analyze); TTFV median.
- Row 3 — **Engagement / North star:** Weekly Activated Users trend; briefs per active user.
- Row 4 — **Monetization:** paywall_viewed → upgrade_completed %, MRR, free→paid %, by trigger surface.
- Row 5 — **Retention:** weekly cohort retention curve; win‑back recovery %.

**90‑day targets per stage:** Visitor→Signup 10% · Signup→Activated 40% · Activated→Habituated 40% · Free→Paid 5–8% · Month‑1 logo retention ≥ 85%. Review weekly against these; kill or double‑down monthly.

---

### Notes on fit with the stack
- **Supabase:** you can (and should, week 1) instrument every funnel event directly and pipe it to a dashboard — the marketing plan is only as good as the data behind it. The self‑grading track record is already a Supabase‑native asset; surface it as public proof.
- **Vercel:** landing‑page and paywall iterations ship in minutes — treat the landing page and pricing page as living, continuously A/B‑tested assets, not one‑time builds. Test the hero headline, the example‑brief placement, and the paywall trigger copy first.
- **The honesty constraints are the moat.** "Never fabricates a number," "grades its own calls," "paraphrase + attribute," "not advice" aren't compliance footnotes — in an era of confidently wrong AI, they are the single most differentiated, most trust‑building thing you can put at the center of every asset. Lead with them.
