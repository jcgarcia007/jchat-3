# subscriptions — Supabase Edge Function

Handles subscription lifecycle for JChat 3.0 (Task 3.15): Stripe Checkout session creation and webhook processing for plan upgrades, downgrades, payment failures (3-day grace period), and recoveries.

## Deploy

```bash
supabase functions deploy subscriptions
```

## Required environment variables

Set these in the Supabase dashboard under **Edge Functions → Secrets** (or via `supabase secrets set`):

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_…` or `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) from Stripe dashboard |
| `SB_SECRET_KEY` | Supabase service role key (bypasses RLS for webhook writes) |
| `STRIPE_PRICE_VERIFIED` | Stripe Price ID for the Verified plan ($1.99/mo) |
| `STRIPE_PRICE_BUSINESS` | Stripe Price ID for the Business plan ($49/mo) |
| `STRIPE_PRICE_PRO` | Stripe Price ID for the Pro plan ($99/mo) |
| `STRIPE_PRICE_BUSINESS_6M` | Business, billed every 6 months ($264) |
| `STRIPE_PRICE_BUSINESS_1Y` | Business, billed yearly ($468) |
| `STRIPE_PRICE_PRO_6M` | Pro, billed every 6 months ($534) |
| `STRIPE_PRICE_PRO_1Y` | Pro, billed yearly ($948) |

The four 6-month / 1-year prices are created by a script (never by hand), on the same Stripe products as the monthly prices:

```bash
# Test mode. Dry run by default (writes nothing); add --apply to create. Re-running prints "ya existe" for each price.
STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_BUSINESS=price_… STRIPE_PRICE_PRO=price_… \
  deno run --allow-env --allow-net supabase/scripts/stripe_create_interval_prices.ts [--apply]
```

It prints the four `supabase secrets set STRIPE_PRICE_*=…` lines to paste. The script refuses an `sk_live_` key unless run with `--live` and `CONFIRM_LIVE=yes`.

`SUPABASE_URL` is injected automatically by the Supabase runtime.

## `create_checkout` — billing interval

`POST /subscriptions { action: "create_checkout", plan, interval?, promo_code?, success_url?, cancel_url? }`

- `interval`: `"month"` (default when omitted) | `"6month"` | `"year"`. Any other value → `400 INVALID_INTERVAL`. Plans other than `business`/`pro` only accept `month`.
- The price is `(plan, interval)` → one of the six `STRIPE_PRICE_*` secrets. If the secret of the requested interval is missing the answer is the usual 500 "No Stripe Price ID configured"; it **never** falls back to the monthly price.
- Free trial (30 days, or the days of a valid promo code): only if `users.trial_used_at` is null. The checkout metadata carries `interval` and, when a trial is requested, `trial: "1"`.

## Webhook: plan and interval come from the price

- The plan is read from the subscription's **price** (`price.metadata.plan`), then from the subscription metadata, then from the configured price ids. If none is valid the function logs an error and keeps the plan the user already has (it never downgrades to `regular`).
- `users.plan_interval` (`month` | `6month` | `year`, from `price.recurring`) is written in `checkout.session.completed` and `customer.subscription.updated`, and cleared in `customer.subscription.deleted`. An unknown interval is stored as null with a warning.
- `users.trial_used_at` is written once in `checkout.session.completed` (when the subscription has a trial) and never overwritten or cleared.
- Affiliate commission (A2) recognises the three price ids of each commissionable plan and applies to the full amount paid (6 months / 1 year included).

Helpers live in `billing.ts` (tests: `deno test supabase/functions/subscriptions/billing_test.ts`). **Apply migrations 267 and 268 before deploying this version.**

## Stripe webhook configuration

In the Stripe dashboard, create a webhook endpoint pointing to your function URL (`https://<project-ref>.supabase.co/functions/v1/subscriptions`) and subscribe to these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.trial_will_end`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and uncomment the signature verification block in `index.ts` before going to production.
