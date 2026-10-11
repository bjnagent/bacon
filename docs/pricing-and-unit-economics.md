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
4 on-demand briefs, 10 refreshes) — worst case $4.65 of compute per trial.

Allowances reset on the 1st of each month (UTC). Metering is atomic
(`consume_feature`), happens after request validation and before any paid
work, and is refunded (`release_feature`) when the work fails. The existing
150-call daily cap remains as a burst limiter.

**Advice mode** (BUY/SELL with entry, stop and size) is not for sale: it stays
an operator allowlist (`ADVICE_EMAILS`). Selling personalised directives would
likely require investment-adviser registration (US) or a capital markets
licence (SG).

## Unit costs (production `ai_events`, Aug–Oct 2026)

| Action | Measured | Sample | Planning cost (`UNIT_COST_USD`) |
|---|---|---|---|
| Nightly personal sweep (Haiku brief + Gemini scouts/news/watch) | $0.060/user-day, p90 $0.065 | 78 user-days | $0.07/day (`NIGHTLY_SWEEP_USD`) |
| Deep dive (Sonnet + ≤6 searches) | $0.126 | 1 | $0.20 |
| Pressure test | $0.124 | 2 | $0.13 |
| Chat message | $0.059 | 1 | $0.06 |
| On-demand brief (bulk model, cached snapshot) | $0.055 | 40 | $0.06 |
| Refresh (cheap tier, Claude fallback) | $0.0005–0.11 | 274 | $0.03 |

User-initiated samples are tiny (pre-launch). Re-run monthly:

```sql
select route, model, count(*), avg(cost_usd), percentile_cont(0.9) within group (order by cost_usd)
from ai_events where ok and created_at > now() - interval '30 days' group by 1, 2 order by sum(cost_usd) desc;
```

## Cost to serve (per member per month)

| | Free | Pro | Desk |
|---|---|---|---|
| Typical (25% of every allowance) | $0.32 | $5.64 | $12.83 |
| Heavy (50%) | $0.65 | $9.17 | $23.55 |
| Every allowance used | $1.29 | $16.25 | $45.00 |

## Gross margin after channel fees (typical member)

Stripe: 2.9% + $0.30. App Store: 15% (Small Business Program, and every
subscription after its first year); 30% shown for reference.

| | Web | App Store 15% | App Store 30% |
|---|---|---|---|
| Pro monthly | 70% | 67% | 60% |
| Pro annual | 61% | 56% | 46% |
| Desk monthly | 73% | 70% | 63% |
| Desk annual | 65% | 60% | 51% |

A member who uses every allowance is covered on monthly web billing (Pro 15%,
Desk 7%) and is negative on annual App Store billing; the meters, the daily cap
and trial caps bound that exposure.

## Scenario: 1,000 MAU

12% Pro, 3% Desk, 55% annual, half via the App Store, 150 trials/month, ~$125/mo
fixed infrastructure: **$3,363 gross MRR, $3,051 net, $1,660 AI compute (paid
$1,062 / free $298 / trials $300), $1,267/mo contribution (42%)**. Each paid
member contributes ~$13.26/mo; break-even at early scale is ~20 paid members.

## Levers

1. Build the personal brief from the shared research instead of its own web
   searches (~halves the $2.10/mo fixed cost per paid member).
2. Chat: cap at 3 searches; route follow-ups that don't need fresh data to the
   bulk model.
3. Steer annual purchases to web checkout where storefront rules allow.
4. Raise Pro to $24.99 once the public record has six months of graded calls.

## Watch

Compute per paid member (ai_events ⨝ subscriptions) · share of members hitting
any allowance (>10% = limits too tight) · trial→paid conversion · annual share
and App Store/web mix · deep-dive cache hit rate.
