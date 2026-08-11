# Bacon — Positioning & UX Review

*A read of the system as built, not as described. Every claim below is traced to code.*

---

## 1. The verdict

**Bacon is not Yahoo Finance.** Yahoo is a data utility: it holds no view, waits to be asked, and monetises attention. Bacon holds a view, arrives unprompted, and has no ad surface.

**Bacon is not Seeking Alpha.** Seeking Alpha is a marketplace of many human analysts plus quant grades. Its product is *breadth and disagreement* — you choose whose read to trust. Bacon is a single voice. Nobody is arguing in the margins.

**Bacon is shaped like Motley Fool** — one house, opinionated dated calls, push delivery, subscription — **but its differentiator is precisely the thing the Fool is most criticised for.** The Fool markets its track record. Bacon *computes* its own, against SPY, and lets the result change how it reasons next time.

> ### The position
> **Bacon is an analyst that has to live with its calls.**
>
> Every morning it files a small number of specific, dated calls, each with the condition that would kill it. Thirty days later it prices them against SPY and shows the result — and that record feeds back into how it reasons next time.
>
> Yahoo gives you data and no opinion. The Fool gives you an opinion and a sales page. **Bacon gives you an opinion and the receipt.**

---

## 2. What Bacon actually is, from the code

The thing that makes Bacon unusual is not the brief. It's the **closed accountability loop** — and it is genuinely built, not aspirational:

| Stage | Where | What happens |
|---|---|---|
| 1. Assemble | `app/api/cron/sweep`, `lib/brief.ts` | Real movers (Alpha Vantage), macro (FRED), SEC Form-4 insider clusters, paraphrased headlines, commodities/FX, community pulse, the user's themes and tracked names |
| 2. Synthesise | `app/api/brief` | One AI pass → ranked ideas, each with thesis, converging signals, horizon, **confirm line and kill line** |
| 3. **File** | `recordCalls()`, `lib/calls.ts:99` | Every actionable call is written to `calls` with its target, horizon date, and how crowded the name was *at call time* |
| 4. **Grade** | `gradeCalls()`, `lib/calls.ts:152` | After 30 days: priced against a real series, benchmarked against SPY over the same window, direction hit recorded, target error computed |
| 5. **Learn** | `buildCalibrationMemo()`, `lib/calls.ts:210` | Graded calls aggregate into a memo — *"you run hot on high-conviction momentum calls"* — that is injected into every future brief and analysis prompt |
| 6. Show | `TrackRecordView.tsx` | Hypothetical $10K per idea vs the same money in SPY, hit rate, alpha |

Step 5 is the rare part. Most AI market tools are stateless: they are exactly as confident on day 400 as on day 1, because nothing they said has ever come back to them. Bacon's prompt carries its own arrest record.

There is also **episodic** memory (`buildInstrumentMemo`, `lib/calls.ts:278`), deliberately *not* gated on sample size: if the desk called NVDA three months ago it sees that call and its outcome before calling it again — so it cannot silently flip without saying what changed. That is a real editorial-integrity mechanism and nothing in the competitive set has it.

**Honesty machinery that also works:** `auditFigures()` flags any hard figure stated without a source and surfaces it in a "Data check" panel *in the user's face*, not in a footnote. Fundamentals come from SEC XBRL rather than from the model's memory.

---

## 3. Where Bacon sits

| | Yahoo Finance | Seeking Alpha | Motley Fool | **Bacon** |
|---|---|---|---|---|
| Product shape | Data utility | Analyst marketplace | Pick newsletter | **Automated desk** |
| Who holds the view | Nobody | Many, contradictory | The house | **The system** |
| Push or pull | Pull | Pull + alerts | Push | **Push** |
| Track record | n/a | Per-author ratings | Self-marketed | **Computed vs SPY** |
| Tells you what would break it | No | Sometimes | Rarely | **Always** |
| Learns from being wrong | — | — | — | **Yes** |
| Business model | Ads | Subscription | Subscription | Subscription |

The bottom two rows are the entire moat. Everything above them is table stakes someone with an API key can rebuild in a fortnight.

---

## 4. What's wrong with the current positioning

Today's line — *"your overnight opportunity desk… it finds, you don't search"* (`app/welcome/page.tsx`, `reports/3-marketing-gtm-plan.md`) — leads with the **weakest** of the three claims.

1. **It's the most crowded claim in the category.** Every newsletter since 1995 has promised to find ideas so you don't have to.
2. **It's the least defensible.** Any competent team can wire an LLM to a screener and ship a plausible daily idea list this quarter. Nothing about it is hard.
3. **It's not where the engineering went.** The hard, unusual, genuinely differentiated code is steps 3–5 above. The GTM plan has this as pillar #3, behind "it finds, you don't search" and "convergence, not a hot take."
4. **"Opportunity desk" is a category nobody searches for.** It describes the mechanism, not the reason to care.

**Recommendation: swap pillar 1 and pillar 3.** Lead with accountability. Discovery becomes *how* it works, not *why* you'd choose it.

---

## 5. The structural catch — and it's the important one

The proof you should lead with **does not exist for a new user, and does not exist at all in aggregate.**

- `calls` is RLS-scoped per `user_id`; `getCalibrationMemo()` (`lib/calls.ts:242`) reads through the **caller's own session**.
- `gradeCalls()` only touches calls older than **30 days**.
- `buildCalibrationMemo()` requires **`MIN_N = 8`** graded calls per cohort before a cohort says anything.

Consequences, in order of severity:

1. **A new account's Record tab is empty**, and stays statistically silent for roughly three months of daily sweeping.
2. **There is no house record.** "Bacon's track record" is not one thing — every user grows their own from their own briefs. The GTM plan's week-12 content piece (*"We graded 90 days of Bacon's own calls"*) has no data source behind it.
3. **You cannot put the scorecard on the landing page**, which is exactly where a claim like this has to live.
4. Two users comparing notes have different briefs *and* different records, so word-of-mouth can't compound into a single reputation.

### The fix, and it is the highest-value thing on this list

**Run a house account.** A canonical Bacon account that sweeps a fixed universe every day, files its calls, and grades them publicly — the same code path every user gets, with nothing hand-picked. Surface it at `/record` with no login.

That single asset becomes: the landing page proof strip, the Show HN post, the week-12 content piece, the answer to "why should I trust an AI about money," and the reason the positioning above is a *fact* rather than a promise. It costs one cron-eligible account and the sweep budget you're already paying.

Until it exists, lead marketing with **the method** (every idea ships with the condition that would kill it; unsourced numbers get flagged) — those *are* visible on day one — and treat the scorecard as the payoff you earn into.

---

## 6. UI / UX review

### 6.1 The information architecture is flat where the story is sequential

Six mobile destinations — Today, Record, Radar, News, Property, Analyze (`AppShell.tsx:104`) — presented as peers. They aren't:

- **Today → Record is one loop** (the call, then how it aged). Splitting it across two tabs hides the single most persuasive thing the product does. A user can browse Today for weeks and never learn there's a scorecard.
- **Radar overlaps Today.** Both surface ideas. The difference — themed scouting vs synthesised brief — is an implementation detail the user has to reverse-engineer.
- **News is a commodity.** It's the one surface where Bacon competes directly with Yahoo, on Yahoo's terms, and loses.
- **Property is a different product.** See below.

**Recommendation:** collapse to four — **Today** (with Record as a segment inside it, so the scorecard is one tap from the call), **Analyze**, **Radar**, and everything else behind More. This also closes D7.

### 6.2 Property is the single biggest positioning liability

`PropertyView.tsx` tracks SG/AU housing indices with rent-vs-mortgage carry math. It is competent and genuinely unserved — and it has **nothing to do with an equity-calls desk.**

It is the reason this app is hard to describe in one sentence, which is the problem you asked me to solve. A prospect who lands on "the desk that keeps its own scorecard" and sees a Singapore HDB index tab concludes, correctly, that they don't know what this is.

**Options, in order of preference:**
1. **Spin it out.** Separate product, separate landing page, shared login. It has its own audience and its own SEO wedge.
2. **Demote it** behind More, and market it only to SG/AU users after activation.
3. Keep it prominent and accept that Bacon has no clear position. *This is the current state.*

### 6.3 "Eight lenses" undersells what's actually there

The claim is a feature count, and feature counts don't persuade. Worse, it's *vaguer than the truth*. From `app/api/analyze/route.ts:47-70`, roughly half the lenses receive hard numeric grounding:

| Grounded in real data | Reasoned from live search |
|---|---|
| Fundamental — SEC XBRL filings | Technical |
| Valuation — SEC XBRL + live close | Factor |
| Trend health — real moving averages | Risk |
| Macro — live FRED backdrop | |
| Smart-money — insider clusters, community pulse | |

"Five of the eight lenses run on filed and measured data, not the model's memory" is a **stronger and more specific** claim than "eight professional lenses," and it's true. Say that instead.

### 6.4 The brand fights the product

Bacon, the rasher logo, 🥓, and the "kitchen makeover" (#22) are warm and memorable. The value proposition is *discipline, accountability, and refusing to make things up.*

That tension isn't fatal — a friendly name on a rigorous product is a fine trade, and the "Daylight Instrument" visual system already leans serious. But the **copy** should stop reaching for the food joke. Every 🥓 in a headline spends credibility you need for "trust this with money."

### 6.5 Vocabulary sprawl

One concept, three names: **Radar** (nav) → **Scout** (the control inside it) → **fresh finds** (the feed it produces). Also **brief** vs **opportunities** vs **ideas** vs **calls** used interchangeably, when `calls` is a precise thing with a database table and a grading pipeline behind it.

Pick one word per concept. *Call* is the valuable one — it implies commitment and invites scoring. Use it deliberately and only for filed, gradeable calls.

### 6.6 What is genuinely excellent — don't touch it

- **Kill conditions on every idea.** Almost nobody does this. It is the clearest signal of intellectual honesty in the product and should be in the hero, not paragraph four.
- **The Data check panel.** Flagging your *own* output's unsourced figures, visibly, is remarkable restraint.
- **The no-fabrication constraint**, enforced in prompts and architecture rather than promised in a footer.
- **The convergence gauge.** Conviction as agreement across independent reads is a genuinely good idea, well visualised.
- **Episodic per-name memory.** Nothing in the competitive set can't-flip-flop-silently.

---

## 7. Ranked recommendations

| # | Action | Why | Effort |
|---|---|---|---|
| 1 | **Build the house record** at a public `/record` | Makes the positioning provable instead of promised. Unblocks landing page, launch, and the trust objection | Med |
| 2 | **Rewrite the hero around accountability** | Current lead is the most crowded, least defensible claim you have | Low |
| 3 | **Fold Record into Today** | The scorecard is the argument; it shouldn't be a tab people never open | Low |
| 4 | **Demote or spin out Property** | It is the reason the product can't be described in one sentence | Low–Med |
| 5 | **Replace "eight lenses" with the grounding split** | More specific, more credible, and true | Low |
| 6 | **One word per concept** — standardise on *call* | "Call" implies commitment, which invites scoring, which is the moat | Low |
| 7 | Drop News from the primary nav | Only surface where you compete with Yahoo on Yahoo's terms | Low |

---

## 8. Copy to use

**Positioning statement**
> For self-directed investors who've learned to distrust confident market opinions, **Bacon** is a research desk that files dated calls with the condition that would kill each one — then grades itself against SPY and shows you the result. Unlike newsletters that market their record, Bacon computes it, publishes it, and lets it change how it reasons next time.

**Hero**
- **H1:** It makes the call. Then it shows you how the last ones did.
- **Sub:** Every morning Bacon files a handful of specific, dated calls from real market signals — each with the condition that would kill it. Thirty days later it prices them against SPY and publishes the result. No hand-picked winners, no hindsight.
- **Primary CTA:** See the scorecard → *(no login)* · **Secondary:** Start free

**Proof strip:** Every call dated and scored · Graded against SPY, not against itself · Unsourced figures flagged · Never invents a number

**One-liners**
- *"Opinion, with the receipt."*
- *"The only research desk that has to live with what it said."*
- *"We publish the misses too. That's the product."*

**The competitive line, when asked:**
> Yahoo gives you data and no opinion. Seeking Alpha gives you fifty opinions and leaves you to pick. The Fool gives you an opinion and a sales page for its track record. Bacon gives you one opinion, dated, with the kill condition — and a scorecard it didn't get to edit.
