# Pricing and unit economics

The plan catalog in `lib/plans.ts` is the single source of truth — the pricing
page, the paywall, the server-side gate and this model all read it. Tests in
`lib/plans.test.ts` fail if a price or allowance change breaks the margin
targets below.

## Plans

| | Free | Pro | Desk |
|---|---|---|---|
| Price | $0 | $19.99/mo · $179.99/yr | $49.99/mo · $449.99/yr |
| Daily brief | House (shared) | Personal | Personal |
| Deep dives / mo | 3 | 25 | 80 |
| Pressure tests / mo (Bull vs Bear, investor takes; Desk adds red team, chain map) | — | 15 | 50 |
| Chat messages / mo | 10 | 80 | 250 |
| On-demand briefs / mo | — | 20 | 40 |
| Refreshes / mo (tracked-name updates, theme scout, headlines, property outlook) | 3 | 40 | 100 |
| Tracked names / themes | 5 / 3 | 30 / 10 | 100 / 25 |
| Kill watch, push, morning email, property tracker | — | ✓ | ✓ |

Every new account gets a **7-day Pro reverse trial with no card**, at capped
trial allowances (`TRIAL_LIMITS`: 8 deep dives, 4 pressure tests, 25 chats,
4 on-demand briefs, 10 refreshes) — worst case $3.12 of compute per trial.

Allowances reset on the 1st of each month (UTC). Metering is atomic
(`consume_feature`), happens after request validation and before any paid
work, and is refunded (`release_feature`) when the work fails. The existing
150-call daily cap remains as a burst limiter.

**Advice mode** (BUY/SELL with entry, stop and size) is not for sale: it stays
an operator allowlist (`ADVICE_EMAILS`). Selling personalised directives would
likely require investment-adviser registration (US) or a capital markets
licence (SG).

## Unit costs (production `ai_events`, re-measured Nov 2026)

Models since 14 Oct 2026: **Claude Sonnet 5.5** ($2 / $10 per MTok) for
user-facing work, **Claude Haiku 5.5** ($0.10 / $0.50, 5x past 100K prompt
tokens) for the nightly brief and the Claude fallback, Gemini 2.5 Flash for the
cheap tier. Web search is $0.01 a call on every model, and is now about half of
every user-initiated cost — the search caps move these numbers more than the
model does.

| Action | Measured | Sample | Planning cost (`UNIT_COST_USD`) |
|---|---|---|---|
| Nightly personal sweep (Haiku 5.5 brief + Gemini scouts/news/watch) | $0.021/account-day, p90 $0.035 | 66 account-days | $0.03/day (`NIGHTLY_SWEEP_USD`) |
| Deep dive (Sonnet 5.5 + ≤6 searches) | $0.085* | 2 | $0.12 |
| Pressure test | $0.096* | 2 | $0.11 |
| Chat message | $0.046* | 1 | $0.05 |
| On-demand brief (Haiku 5.5, ≤6 searches) | nightly brief call $0.012, p90 $0.025 | 66 | $0.04 |
| Refresh (Gemini, Haiku 5.5 fallback) | $0.0007–0.0036 | 442 | $0.01 |

\* No user-initiated call has run on Sonnet 5.5 yet in production (see the note
below): these are the logged Sonnet 4.6 calls' tokens and searches repriced at
Sonnet 5.5 rates. The planning costs keep ~40% headroom over them until real
samples exist.

**Check `BACON_MODEL`.** The one analysis run after the switch was served by
`claude-sonnet-4-6`, so `BACON_MODEL` is set in production and overrides the
Sonnet 5.5 default. Remove it (or set it to `claude-sonnet-5-5`); until then
user-initiated calls cost ~25% more than the planning costs above assume.

Re-run monthly:

```sql
select route, model, count(*), avg(cost_usd), percentile_cont(0.9) within group (order by cost_usd)
from ai_events where ok and created_at > now() - interval '30 days' group by 1, 2 order by sum(cost_usd) desc;
```

## Cost to serve (per member per month)

| | Free | Pro | Desk |
|---|---|---|---|
| Typical (25% of every allowance) | $0.22 | $3.36 | $8.45 |
| Heavy (50%) | $0.45 | $5.83 | $16.00 |
| Every allowance used | $0.89 | $10.75 | $31.10 |

The nightly brief is now $0.90 of a paid member's month (was $2.10).

## Gross margin after channel fees (typical member)

Stripe: 2.9% + $0.30. App Store: 15% (Small Business Program, and every
subscription after its first year); 30% shown for reference.

| | Web | App Store 15% | App Store 30% |
|---|---|---|---|
| Pro monthly | 82% | 80% | 76% |
| Pro annual | 77% | 74% | 68% |
| Desk monthly | 82% | 80% | 76% |
| Desk annual | 77% | 73% | 68% |

A member who uses every allowance is now covered on every channel we plan for:
monthly web leaves 44% (Pro) / 36% (Desk), and even annual App Store billing
stays positive (16% / 2%). The meters, the daily cap and trial caps still bound
the exposure.

## Scenario: 1,000 MAU

12% Pro, 3% Desk, 55% annual, half via the App Store (15%), 150 trials/month at
half the trial cap, free members at 25% of their allowances, ~$125/mo fixed
infrastructure: **$3,363 gross MRR, $3,051 net, $1,078 AI compute (paid $657 /
free $187 / trials $234), $1,848/mo contribution (61%)**, up from $1,267 (42%)
on the previous models. Each paid member contributes ~$15.96/mo before free and
trial costs; with this scenario's free and trial mix, break-even is ~10 paid
members.

## Levers

1. Search caps: at $0.01 a call, searches are now ~half of every
   user-initiated cost. Cap chat at 3 searches and reuse the shared snapshot
   where a question doesn't need fresh data.
2. Steer annual purchases to web checkout where storefront rules allow.
3. Raise Pro to $24.99 once the public record has six months of graded calls —
   for positioning, not margin: margins no longer need it.
4. The margin headroom could instead buy bigger allowances (e.g. Pro deep dives
   25 → 35) if members hit limits; check the "share hitting any allowance"
   metric first.

## Watch

Compute per paid member (ai_events ⨝ subscriptions) · share of members hitting
any allowance (>10% = limits too tight) · trial→paid conversion · annual share
and App Store/web mix · deep-dive cache hit rate.
